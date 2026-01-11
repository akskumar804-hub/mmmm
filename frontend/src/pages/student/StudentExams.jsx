import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

export default function StudentExams() {
  const { token } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiRequest("/student/exams", { token });
        if (!mounted) return;
        setSubjects(res.exams || []);
        setRules(res.rules || null);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load exams");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Exams</h1>
          <p className="page-subtitle">
            Auto-evaluated MCQ exams. Results are released after{" "}
            {rules?.resultReleaseDays ?? 3} days.
          </p>
        </div>
      </header>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Exam Title</th>
              <th>Duration</th>
              <th>Latest Attempt</th>
              <th>Result</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => {
              const latest = s.latestAttempt;
              const resultCell = !latest
                ? "—"
                : latest.resultVisible
                ? latest.passed
                  ? `Passed (${latest.scorePercent}%)`
                  : `Failed (${latest.scorePercent}%)`
                : `Pending (releases ${new Date(
                    latest.resultReleaseAt
                  ).toLocaleString()})`;

              // Format retake message
              let actionContent = null;
              if (s.eligible) {
                actionContent = (
                  <Link
                    className="btn-primary"
                    to={`/student/courses/${s.courseId}/exam/attempt`}
                  >
                    {latest ? "Retake" : "Attempt"}
                  </Link>
                );
              } else {
                let reasonDisplay = s.eligibilityReason || "Not eligible";
                actionContent = <span className="muted">{reasonDisplay}</span>;
              }

              return (
                <tr key={s.examId}>
                  <td>{s.courseTitle}</td>
                  <td>
                    <strong>{s.title}</strong>
                  </td>
                  <td>{s.durationMinutes} min</td>
                  <td>{latest ? `#${latest.attemptNo}` : "—"}</td>
                  <td>
                    <span
                      className={`status-pill ${
                        latest?.resultVisible
                          ? latest.passed
                            ? "passed"
                            : "failed"
                          : "pending"
                      }`}
                    >
                      {resultCell}
                    </span>
                  </td>
                  <td>{actionContent}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-title">Retake rule</h3>
        <p className="muted" style={{ marginTop: 8 }}>
          If you fail a subject, you can retake only that subject after a
          cooldown of <strong>{rules?.retakeGapDays ?? 7} days</strong>,
          starting <strong>after the result release date</strong>.
        </p>
      </div>
    </div>
  );
}
