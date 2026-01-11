import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function StudentCourseDetail() {
  const { id } = useParams();
  const courseId = id;
  const navigate = useNavigate();
  const { token } = useAuth();

  const [course, setCourse] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receiptFile, setReceiptFile] = useState(null);
  const [message, setMessage] = useState("");

  const myEnrollment = useMemo(
    () => enrollments.find((e) => String(e.courseId) === String(courseId)),
    [enrollments, courseId]
  );

  const refreshEnrollments = async () => {
    const res = await apiRequest("/student/enrollments", { token });
    setEnrollments(res.enrollments || []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const c = await apiRequest(`/courses/${courseId}`);
        if (!mounted) return;
        setCourse(c.course);
        await refreshEnrollments();
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load course");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [courseId, token]);

  const handleApply = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/student/enrollments", {
        method: "POST",
        token,
        body: { courseId: Number(courseId) },
      });
      await refreshEnrollments();
      setMessage(
        "Applied successfully. Now complete your profile and upload documents."
      );
    } catch (e) {
      setError(e.message || "Failed to apply");
    } finally {
      setBusy(false);
    }
  };

  const handleUploadReceipt = async () => {
    if (!receiptFile || !myEnrollment) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("receipt", receiptFile);
      await apiRequest(
        `/student/enrollments/${myEnrollment.id}/upload-receipt`,
        {
          method: "POST",
          token,
          body: fd,
          isForm: true,
        }
      );
      await refreshEnrollments();
      setReceiptFile(null);
      setMessage(
        "Receipt uploaded. Admin will confirm payment and issue Enrollment No."
      );
    } catch (e) {
      setError(e.message || "Receipt upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePayOnline = async () => {
    if (!myEnrollment) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Razorpay script failed to load");

      const order = await apiRequest(
        `/student/enrollments/${myEnrollment.id}/razorpay/order`,
        {
          token,
          method: "POST",
        }
      );

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "LMS Payment",
        description: course?.title || "Course payment",
        order_id: order.orderId,
        handler: async (resp) => {
          try {
            await apiRequest(
              `/student/enrollments/${myEnrollment.id}/razorpay/verify`,
              {
                token,
                method: "POST",
                body: {
                  razorpay_order_id: resp.razorpay_order_id,
                  razorpay_payment_id: resp.razorpay_payment_id,
                  razorpay_signature: resp.razorpay_signature,
                },
              }
            );
            setMessage("Payment successful. Your course will be activated.");
            await refreshEnrollments();
          } catch (e) {
            setError(e.message || "Payment verification failed");
          }
        },
        modal: {
          ondismiss: () => {
            // user closed
          },
        },
      };

      const rz = new window.Razorpay(options);
      rz.open();
    } catch (e) {
      setError(e.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (error) return <p className="status-pill failed">{error}</p>;
  if (!course) return null;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">{course.title}</h1>
          <p className="page-subtitle">{course.shortDescription}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {myEnrollment &&
            (myEnrollment.status === "PAID" ||
              myEnrollment.status === "ACTIVE" ||
              myEnrollment.status === "COMPLETED") && (
              <button
                className="btn-primary"
                type="button"
                onClick={() => navigate(`/student/learn/${course.id}`)}
              >
                Start Learning
              </button>
            )}
          <button
            className="btn-secondary"
            type="button"
            onClick={() => navigate("/student/courses")}
          >
            Back to courses
          </button>
        </div>
      </header>

      {message && <p className="status-pill pending">{message}</p>}
      {error && <p className="status-pill failed">{error}</p>}

      <div className="two-column">
        <section className="card" style={{ alignSelf: "start" }}>
          <h3 className="card-title">Course Overview</h3>
          <p className="card-description" style={{ marginTop: 8 }}>
            {course.description}
          </p>

          <div className="card-meta">
            <p>
              <span className="muted">Duration:</span> {course.duration}
            </p>
            <p>
              <span className="muted">Admission Fee:</span> ₹
              {course.admissionFee ?? 3000}
            </p>
            <p>
              <span className="muted">Tuition Fee:</span> ₹{course.tuitionFee}
            </p>
          </div>

          {!myEnrollment && (
            <button
              className="btn-primary"
              type="button"
              onClick={handleApply}
              disabled={busy}
            >
              {busy ? "Applying..." : "Apply / Enroll"}
            </button>
          )}

          {myEnrollment && (
            <div style={{ marginTop: 12 }}>
              <p className="muted">
                Enrollment status: <strong>{myEnrollment.status}</strong>
                {myEnrollment.enrollmentNo ? (
                  <>
                    {" "}
                    • Enrollment No:{" "}
                    <strong>{myEnrollment.enrollmentNo}</strong>
                  </>
                ) : null}
              </p>

              {(myEnrollment.status === "PAYMENT_PENDING" ||
                myEnrollment.status === "PAYMENT_REJECTED") && (
                <div style={{ marginTop: 10 }}>
                  <p className="muted" style={{ marginBottom: 6 }}>
                    Pay online (Razorpay) or upload receipt:
                  </p>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={handlePayOnline}
                    disabled={busy}
                  >
                    {busy ? "Processing..." : "Pay Online"}
                  </button>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    If Razorpay keys are not set on the server, use receipt
                    upload instead.
                  </div>
                  {myEnrollment.status === "PAYMENT_REJECTED" && (
                    <p
                      className="muted"
                      style={{ color: "#dc2626", marginTop: 10 }}
                    >
                      Payment was rejected. Please upload again.
                    </p>
                  )}
                  <p className="muted">
                    Upload payment receipt (after admin approves your profile):
                  </p>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) =>
                      setReceiptFile(e.target.files?.[0] || null)
                    }
                  />
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={handleUploadReceipt}
                    disabled={busy || !receiptFile}
                    style={{ marginTop: 8 }}
                  >
                    {busy ? "Uploading..." : "Upload receipt"}
                  </button>
                </div>
              )}

              {myEnrollment.status === "RECEIPT_UPLOADED" && (
                <p className="muted">
                  Receipt uploaded. Waiting for admin confirmation.
                </p>
              )}

              {["PAID", "ACTIVE", "COMPLETED"].includes(
                myEnrollment.status
              ) && (
                <p className="muted">
                  Course is active. You can attempt exams subject-wise.
                </p>
              )}

              <button
                className="btn-secondary"
                type="button"
                onClick={() => navigate("/student/profile")}
                style={{ marginTop: 10 }}
              >
                Complete profile & upload docs
              </button>
            </div>
          )}
        </section>

        <section className="card" style={{ alignSelf: "start" }}>
          <h3 className="card-title">Subjects</h3>
          <div style={{ marginTop: 10 }}>
            {course.subjects?.length ? (
              <ul className="muted" style={{ lineHeight: 1.7 }}>
                {course.subjects.map((s) => (
                  <li key={s.id}>
                    {s.name}{" "}
                    <span className="pill" style={{ marginLeft: 8 }}>
                      {s.semester || "Subject"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No subjects configured yet.</p>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <h4
              className="section-title"
              style={{ margin: 0, fontSize: "1rem" }}
            >
              Exam rules
            </h4>
            <ul className="muted" style={{ lineHeight: 1.7 }}>
              <li>Auto evaluated.</li>
              <li>
                Result visible after <strong>3 days</strong>.
              </li>
              <li>
                If you fail, you can retake only that subject (arrears style).
              </li>
              <li>
                Retake cooldown starts <strong>after result release</strong>.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
