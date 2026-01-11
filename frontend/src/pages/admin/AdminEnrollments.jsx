import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:4000/api"
).replace(/\/?api\/?$/, "");

export default function AdminEnrollments() {
  const { token } = useAuth();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const load = async () => {
    const res = await apiRequest("/admin/enrollments", { token });
    setEnrollments(res.enrollments || []);
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

  const filtered = useMemo(() => {
    if (filter === "ALL") return enrollments;
    return enrollments.filter((e) => e.status === filter);
  }, [enrollments, filter]);

  const approveProfile = async (studentId) => {
    setBusyId(`approve-${studentId}`);
    setError("");
    try {
      await apiRequest(`/admin/students/${studentId}/approve-profile`, {
        method: "POST",
        token,
      });
      await load();
    } catch (e) {
      setError(e.message || "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const rejectProfile = async (studentId) => {
    const reason = prompt("Enter rejection reason (optional):");
    if (reason === null) return; // User cancelled
    setBusyId(`reject-profile-${studentId}`);
    setError("");
    try {
      await apiRequest(`/admin/students/${studentId}/reject-profile`, {
        method: "POST",
        token,
        body: { reason: reason || null },
      });
      await load();
    } catch (e) {
      setError(e.message || "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const confirmPayment = async (enrollmentId) => {
    setBusyId(`pay-${enrollmentId}`);
    setError("");
    try {
      await apiRequest(`/admin/enrollments/${enrollmentId}/confirm-payment`, {
        method: "POST",
        token,
      });
      await load();
    } catch (e) {
      setError(e.message || "Payment confirmation failed");
    } finally {
      setBusyId(null);
    }
  };

  const rejectPayment = async (enrollmentId) => {
    const reason = prompt("Enter rejection reason (optional):");
    if (reason === null) return; // User cancelled
    setBusyId(`reject-payment-${enrollmentId}`);
    setError("");
    try {
      await apiRequest(`/admin/enrollments/${enrollmentId}/reject-payment`, {
        method: "POST",
        token,
        body: { reason: reason || null },
      });
      await load();
    } catch (e) {
      setError(e.message || "Payment rejection failed");
    } finally {
      setBusyId(null);
    }
  };

  const markCompleted = async (enrollmentId) => {
    if (!confirm("Mark this enrollment COMPLETED and issue certificate?"))
      return;
    setBusyId(`complete-${enrollmentId}`);
    setError("");
    try {
      await apiRequest(`/admin/enrollments/${enrollmentId}/mark-completed`, {
        method: "POST",
        token,
      });
      await load();
    } catch (e) {
      setError(e.message || "Mark completed failed");
    } finally {
      setBusyId(null);
    }
  };

  const receiptUrl = (path) => (path ? `${API_ORIGIN}${path}` : "");

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Enrollments</h1>
          <p className="page-subtitle">
            Approve profile → receive receipt → confirm payment → course active
            → mark completed.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span className="muted">Filter:</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All</option>
            <option value="APPLIED">APPLIED</option>
            <option value="PROFILE_SUBMITTED">PROFILE_SUBMITTED</option>
            <option value="PROFILE_REJECTED">PROFILE_REJECTED</option>
            <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
            <option value="RECEIPT_UPLOADED">RECEIPT_UPLOADED</option>
            <option value="PAYMENT_REJECTED">PAYMENT_REJECTED</option>
            <option value="PAID">PAID</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
        </div>
      </header>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && filtered.length === 0 && (
        <p className="muted">No enrollments for this filter.</p>
      )}

      {filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Enrollment</th>
                <th>Student</th>
                <th>Course</th>
                <th>Fees</th>
                <th>Exam Attempts</th>
                <th>Exam Results</th>
                <th>Status</th>
                <th>Receipt</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const total = (e.admissionFee ?? 3000) + (e.tuitionFee ?? 0);

                let action = <span className="muted">—</span>;

                if (
                  e.status === "APPLIED" ||
                  e.status === "PROFILE_SUBMITTED"
                ) {
                  action = (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={busyId === `approve-${e.studentId}`}
                        onClick={() => approveProfile(e.studentId)}
                      >
                        {busyId === `approve-${e.studentId}`
                          ? "Approving..."
                          : "Approve"}
                      </button>
                      <button
                        className="btn-danger"
                        type="button"
                        disabled={busyId === `reject-profile-${e.studentId}`}
                        onClick={() => rejectProfile(e.studentId)}
                      >
                        {busyId === `reject-profile-${e.studentId}`
                          ? "Rejecting..."
                          : "Reject"}
                      </button>
                    </div>
                  );
                }

                if (e.status === "RECEIPT_UPLOADED") {
                  action = (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={busyId === `pay-${e.id}`}
                        onClick={() => confirmPayment(e.id)}
                      >
                        {busyId === `pay-${e.id}` ? "Confirming..." : "Confirm"}
                      </button>
                      <button
                        className="btn-danger"
                        type="button"
                        disabled={busyId === `reject-payment-${e.id}`}
                        onClick={() => rejectPayment(e.id)}
                      >
                        {busyId === `reject-payment-${e.id}`
                          ? "Rejecting..."
                          : "Reject"}
                      </button>
                    </div>
                  );
                }

                if (e.status === "PAID") {
                  // Check if student has passed all exams
                  const allPassed =
                    e.latestExamResults &&
                    e.latestExamResults.length > 0 &&
                    e.latestExamResults.every((result) => result.passed);

                  if (allPassed) {
                    action = (
                      <button
                        className="btn-secondary"
                        type="button"
                        disabled={busyId === `complete-${e.id}`}
                        onClick={() => markCompleted(e.id)}
                      >
                        {busyId === `complete-${e.id}`
                          ? "Marking..."
                          : "Mark completed"}
                      </button>
                    );
                  } else {
                    action = (
                      <span
                        className="muted"
                        title="Student must pass all exams first"
                      >
                        Student not passed
                      </span>
                    );
                  }
                }

                if (e.status === "COMPLETED") {
                  action = (
                    <span className="status-pill passed">COMPLETED</span>
                  );
                }

                return (
                  <tr key={e.id}>
                    <td>
                      <div>
                        <strong>{e.enrollmentNo || e.id}</strong>
                      </div>
                      <div className="muted">
                        Created:{" "}
                        {e.createdAt
                          ? new Date(e.createdAt).toLocaleString()
                          : "—"}
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{e.studentName || "—"}</strong>
                      </div>
                      <div className="muted">{e.studentEmail}</div>
                    </td>
                    <td>
                      <div>
                        <strong>{e.courseTitle}</strong>
                      </div>
                      <div className="muted">{e.courseCode || ""}</div>
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
                      <div>
                        <strong>{e.examAttempts ?? 0}</strong>
                      </div>
                      <div className="muted">{e.examPassed ?? 0} passed</div>
                    </td>
                    <td>
                      {e.latestExamResults && e.latestExamResults.length > 0 ? (
                        <div style={{ fontSize: "12px" }}>
                          {e.latestExamResults.map((result, idx) => (
                            <div key={idx} style={{ marginBottom: "4px" }}>
                              <div className="muted">{result.subjectName}:</div>
                              <span
                                className={`status-pill ${
                                  result.passed ? "passed" : "failed"
                                }`}
                              >
                                {result.passed ? "✓ Pass" : "✗ Fail"} (
                                {result.scorePercent}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className="status-pill pending">{e.status}</span>
                    </td>
                    <td>
                      {e.receiptPath ? (
                        <a
                          className="muted"
                          href={receiptUrl(e.receiptPath)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-title">Fee structure</h3>
        <p className="muted" style={{ marginTop: 8 }}>
          Admission fee is fixed at <strong>₹3000</strong>. Tuition fee is{" "}
          <strong>course-wise</strong> (paid once). No exam fees.
        </p>
      </div>
    </div>
  );
}
