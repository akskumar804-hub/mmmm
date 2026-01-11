import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

export default function StudentMyCourses() {
  const { token } = useAuth();
  const [enrollments, setEnrollments] = useState([]);
  const [progressByCourse, setProgressByCourse] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [fileById, setFileById] = useState({});

  const load = async () => {
    const res = await apiRequest("/student/enrollments", { token });
    const list = res.enrollments || [];
    setEnrollments(list);
    // Fetch per-course progress (best-effort)
    const pairs = await Promise.all(
      list.map(async (e) => {
        try {
          const pr = await apiRequest(
            `/student/courses/${e.courseId}/progress`,
            { token }
          );
          return [e.courseId, pr.courseProgress];
        } catch {
          return [e.courseId, null];
        }
      })
    );
    const map = {};
    for (const [cid, pr] of pairs) map[cid] = pr;
    setProgressByCourse(map);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load enrollments");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const uploadReceipt = async (enrollmentId) => {
    const file = fileById[enrollmentId];
    if (!file) return;

    setBusyId(enrollmentId);
    setError("");
    try {
      const fd = new FormData();
      fd.append("receipt", file);
      await apiRequest(`/student/enrollments/${enrollmentId}/upload-receipt`, {
        method: "POST",
        token,
        body: fd,
        isForm: true,
      });
      await load();
      setFileById((p) => ({ ...p, [enrollmentId]: null }));
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">My Courses</h1>
          <p className="page-subtitle">
            Track profile approval, payment, and course completion.
          </p>
        </div>
        <Link className="btn-primary" to="/student/courses">
          Browse courses
        </Link>
      </header>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && enrollments.length === 0 && (
        <p className="muted">No enrollments yet.</p>
      )}

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Progress</th>
              <th>Fees</th>
              <th>Status</th>
              <th>Enrollment No</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => {
              const total = (e.admissionFee ?? 3000) + (e.tuitionFee ?? 0);
              const pr = progressByCourse[e.courseId];
              const pct =
                typeof pr?.completionPercent === "number"
                  ? pr.completionPercent
                  : null;
              const timeMin = pr?.timeSpentSeconds
                ? Math.round(pr.timeSpentSeconds / 60)
                : 0;
              return (
                <tr key={e.id}>
                  <td>
                    <strong>{e.courseTitle}</strong>
                    <div className="muted">
                      {e.level || ""} {e.duration ? `• ${e.duration}` : ""}
                    </div>
                  </td>
                  <td>
                    {pct === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <>
                        <div>
                          <strong>{pct}%</strong>{" "}
                          <span className="muted">
                            ({pr.completedLessons}/{pr.totalLessons})
                          </span>
                        </div>
                        <div className="muted">Time: {timeMin} min</div>
                        <Link
                          className="btn-secondary"
                          to={`/student/learn/${e.courseId}`}
                          style={{ marginTop: 6, display: "inline-block" }}
                        >
                          Learn
                        </Link>
                      </>
                    )}
                  </td>
                  <td>
                    <div className="muted">
                      Admission ₹{e.admissionFee ?? 3000}
                    </div>
                    <div className="muted">Tuition ₹{e.tuitionFee ?? 0}</div>
                    <div>
                      <strong>Total ₹{total}</strong>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        e.status === "PAID" || e.status === "COMPLETED"
                          ? "passed"
                          : e.status === "RECEIPT_UPLOADED" ||
                            e.status === "PAYMENT_PENDING"
                          ? "pending"
                          : "failed"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td>{e.enrollmentNo || <span className="muted">—</span>}</td>
                  <td>
                    {e.status === "PAYMENT_PENDING" ||
                    e.status === "PAYMENT_REJECTED" ? (
                      <div>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(ev) =>
                            setFileById((p) => ({
                              ...p,
                              [e.id]: ev.target.files?.[0] || null,
                            }))
                          }
                        />
                        <button
                          className="btn-primary"
                          style={{ marginTop: 6 }}
                          type="button"
                          disabled={busyId === e.id || !fileById[e.id]}
                          onClick={() => uploadReceipt(e.id)}
                        >
                          {busyId === e.id ? "Uploading..." : "Upload receipt"}
                        </button>
                        {e.status === "PAYMENT_REJECTED" && (
                          <p
                            className="muted"
                            style={{ marginTop: 6, color: "#dc2626" }}
                          >
                            Payment was rejected. Please upload again.
                          </p>
                        )}
                      </div>
                    ) : null}
                    {e.status === "APPLIED" ||
                    e.status === "PROFILE_REJECTED" ? (
                      <div>
                        <span className="muted">
                          {e.status === "APPLIED"
                            ? "Complete profile & upload docs"
                            : "Profile rejected. Update and re-upload docs"}
                        </span>
                        <div style={{ marginTop: 6 }}>
                          <Link
                            className="btn-secondary"
                            to="/student/profile"
                            style={{ display: "inline-block" }}
                          >
                            Update Profile
                          </Link>
                        </div>
                      </div>
                    ) : null}
                    {e.status === "RECEIPT_UPLOADED" && (
                      <span className="muted">Waiting admin confirmation</span>
                    )}
                    {e.status === "PAID" && (
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        <Link
                          className="btn-secondary"
                          to={`/student/learn/${e.courseId}`}
                        >
                          Continue learning
                        </Link>
                        <Link className="btn-secondary" to="/student/exams">
                          Go to exams
                        </Link>
                      </div>
                    )}
                    {e.status === "COMPLETED" && (
                      <Link
                        className="btn-secondary"
                        to="/student/certificates"
                      >
                        View certificate
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
