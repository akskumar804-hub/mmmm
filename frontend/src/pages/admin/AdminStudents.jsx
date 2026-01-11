import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:4000/api"
).replace(/\/?api\/?$/, "");

export default function AdminStudents() {
  const { token } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    const res = await apiRequest("/admin/students", { token });
    setStudents(res.students || []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load students");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const approve = async (studentId) => {
    setBusyId(studentId);
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

  const reject = async () => {
    if (!rejectModal) return;
    setBusyId(rejectModal);
    setError("");
    try {
      await apiRequest(`/admin/students/${rejectModal}/reject-profile`, {
        method: "POST",
        token,
        body: { reason: rejectReason.trim() || null },
      });
      setRejectModal(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setError(e.message || "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const docsLink = useMemo(
    () => (path) => path ? `${API_ORIGIN}${path}` : "",
    []
  );

  return (
    <div className="card">
      <h2 className="section-title">Student accounts</h2>
      <p className="section-helper">
        Review student profile details & documents. Approve profile to unlock
        payment receipt upload.
      </p>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && students.length === 0 && (
        <p className="muted">No students yet.</p>
      )}

      {students.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>DOB</th>
                <th>Latest education</th>
                <th>Docs</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.name || "—"}</td>
                  <td>{s.email}</td>
                  <td>{s.dob || "—"}</td>
                  <td>{s.latestEducation || "—"}</td>
                  <td>
                    <div style={{ display: "grid", gap: 6 }}>
                      {s.photoPath ? (
                        <a
                          className="muted"
                          href={docsLink(s.photoPath)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Photo
                        </a>
                      ) : (
                        <span className="muted">Photo —</span>
                      )}
                      {s.idCardPath ? (
                        <a
                          className="muted"
                          href={docsLink(s.idCardPath)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ID
                        </a>
                      ) : (
                        <span className="muted">ID —</span>
                      )}
                      {s.eduDocPath ? (
                        <a
                          className="muted"
                          href={docsLink(s.eduDocPath)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Education
                        </a>
                      ) : (
                        <span className="muted">Education —</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        s.isProfileVerified ? "passed" : "pending"
                      }`}
                    >
                      {s.isProfileVerified ? "APPROVED" : "PENDING"}
                    </span>
                  </td>
                  <td>
                    {s.isProfileVerified ? (
                      <span className="muted">—</span>
                    ) : (
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        <button
                          className="btn-primary"
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => approve(s.id)}
                        >
                          {busyId === s.id ? "Approving..." : "Approve"}
                        </button>
                        <button
                          className="btn"
                          style={{ borderColor: "#d9534f", color: "#d9534f" }}
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => setRejectModal(s.id)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Reject Student Profile?</h3>
            <p className="muted">
              The student will be notified that their profile has been rejected.
            </p>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Reason (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontFamily: "inherit",
                  minHeight: "80px",
                }}
              />
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                className="btn"
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason("");
                }}
                disabled={busyId === rejectModal}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ backgroundColor: "#d9534f" }}
                onClick={reject}
                disabled={busyId === rejectModal}
              >
                {busyId === rejectModal ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
