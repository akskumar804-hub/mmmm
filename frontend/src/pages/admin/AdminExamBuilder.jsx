import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

export default function AdminExamBuilder() {
  const { token } = useAuth();
  const { courseId } = useParams();
  const cid = Number(courseId);

  const [course, setCourse] = useState(null);
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [examForm, setExamForm] = useState({
    title: "Exam",
    durationMinutes: 30,
    questions: [],
    examType: "MIXED",
    questionTypeConfig: { MCQ: 0, FILL_BLANKS: 0, FREE_TEXT: 0 },
    proctorRequired: false,
    proctorMode: "BASIC",
    proctorScreenshareRequired: false,
  });

  const [newQuestion, setNewQuestion] = useState({
    type: "MCQ", // MCQ, TRUE_FALSE, SHORT_ANSWER
    text: "",
    options: ["", "", "", ""],
    correctAnswer: 0,
    marks: 1,
  });

  const reload = async () => {
    try {
      const coursRes = await apiRequest(`/admin/courses/${cid}`, { token });
      setCourse(coursRes.course);

      const examRes = await apiRequest(`/admin/courses/${cid}/exam`, { token });
      if (examRes.exam) {
        setExam(examRes.exam);
        const questionsData =
          typeof examRes.exam.questionsJson === "string"
            ? JSON.parse(examRes.exam.questionsJson || "[]")
            : examRes.exam.questionsJson || [];
        const configData =
          typeof examRes.exam.questionTypeConfig === "string"
            ? JSON.parse(examRes.exam.questionTypeConfig || "{}")
            : examRes.exam.questionTypeConfig || {};
        setExamForm({
          title: examRes.exam.title,
          durationMinutes: examRes.exam.durationMinutes,
          questions: questionsData,
          examType: examRes.exam.examType || "MIXED",
          questionTypeConfig: configData || {
            MCQ: 0,
            FILL_BLANKS: 0,
            FREE_TEXT: 0,
          },
          proctorRequired: !!examRes.exam.proctorRequired,
          proctorMode: examRes.exam.proctorMode || "BASIC",
          proctorScreenshareRequired: !!examRes.exam.proctorScreenshareRequired,
        });
      }
    } catch (e) {
      setErr(e.message || "Failed to load");
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        await reload();
      } catch (e) {
        if (!mounted) return;
        setErr(e.message || "Failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, token]);

  const addQuestion = async () => {
    if (!newQuestion.text.trim()) {
      setErr("Question text is required");
      return;
    }

    if (newQuestion.type === "MCQ") {
      if (newQuestion.options.some((o) => !o.trim())) {
        setErr("All options are required for MCQ");
        return;
      }
    }

    const updated = [...examForm.questions, { ...newQuestion }];
    setExamForm((p) => ({ ...p, questions: updated }));
    setNewQuestion({
      type: "MCQ",
      text: "",
      options: ["", "", "", ""],
      correctAnswer: 0,
      marks: 1,
    });
    setErr("");
  };

  const removeQuestion = (index) => {
    const updated = examForm.questions.filter((_, i) => i !== index);
    setExamForm((p) => ({ ...p, questions: updated }));
  };

  const updateQuestion = (index, field, value) => {
    const updated = [...examForm.questions];
    updated[index] = { ...updated[index], [field]: value };
    setExamForm((p) => ({ ...p, questions: updated }));
  };

  const updateOption = (qIndex, oIndex, value) => {
    const updated = [...examForm.questions];
    updated[qIndex].options[oIndex] = value;
    setExamForm((p) => ({ ...p, questions: updated }));
  };

  const saveExam = async () => {
    if (!examForm.title.trim()) {
      setErr("Exam title is required");
      return;
    }

    if (examForm.questions.length === 0) {
      setErr("Add at least one question");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const payload = {
        title: examForm.title,
        durationMinutes: examForm.durationMinutes,
        questions: examForm.questions,
        examType: examForm.examType,
        questionTypeConfig: examForm.questionTypeConfig,
        proctorRequired: examForm.proctorRequired,
        proctorMode: examForm.proctorMode,
        proctorScreenshareRequired: examForm.proctorScreenshareRequired,
      };
      const res = await apiRequest(`/admin/courses/${cid}/exam`, {
        method: "POST",
        token,
        body: payload,
      });
      setExam(res.exam);
      setErr("");
      alert("Exam saved successfully!");
    } catch (e) {
      setErr(e.message || "Failed to save exam");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading...</p>;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Exam Builder</h1>
          <p className="page-subtitle">
            Create and manage exams for your course.
          </p>
          {course && (
            <div className="muted">
              Course: <strong>{course.title}</strong>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn-secondary" to={`/admin/courses`}>
            Back
          </Link>
          <Link className="btn-primary" to={`/admin/courses/${cid}/builder`}>
            Course Content
          </Link>
        </div>
      </header>

      {err && <p className="status-pill failed">{err}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Exam Settings</h2>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="label">Exam Title</label>
            <input
              className="input"
              value={examForm.title}
              onChange={(e) =>
                setExamForm((p) => ({ ...p, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="label">Duration (minutes)</label>
            <input
              className="input"
              type="number"
              min="1"
              value={examForm.durationMinutes}
              onChange={(e) =>
                setExamForm((p) => ({
                  ...p,
                  durationMinutes: Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <label className="label">Exam Type</label>
            <select
              className="input"
              value={examForm.examType}
              onChange={(e) =>
                setExamForm((p) => ({ ...p, examType: e.target.value }))
              }
            >
              <option value="MCQ">Multiple Choice Only</option>
              <option value="FILL_BLANKS">Fill in the Blanks Only</option>
              <option value="FREE_TEXT">Free Text Only</option>
              <option value="MIXED">Mixed Types</option>
            </select>
          </div>
        </div>
      </div>

      {examForm.examType === "MIXED" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Question Type Configuration</h2>
          <p className="muted">Specify how many questions of each type</p>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label className="label">Multiple Choice Questions</label>
              <input
                className="input"
                type="number"
                min="0"
                value={examForm.questionTypeConfig.MCQ || 0}
                onChange={(e) =>
                  setExamForm((p) => ({
                    ...p,
                    questionTypeConfig: {
                      ...p.questionTypeConfig,
                      MCQ: Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="label">Fill in the Blanks</label>
              <input
                className="input"
                type="number"
                min="0"
                value={examForm.questionTypeConfig.FILL_BLANKS || 0}
                onChange={(e) =>
                  setExamForm((p) => ({
                    ...p,
                    questionTypeConfig: {
                      ...p.questionTypeConfig,
                      FILL_BLANKS: Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className="label">Free Text Questions</label>
              <input
                className="input"
                type="number"
                min="0"
                value={examForm.questionTypeConfig.FREE_TEXT || 0}
                onChange={(e) =>
                  setExamForm((p) => ({
                    ...p,
                    questionTypeConfig: {
                      ...p.questionTypeConfig,
                      FREE_TEXT: Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Proctoring Settings</h2>
        <p className="muted">Configure proctoring requirements for this exam</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={examForm.proctorRequired}
              onChange={(e) =>
                setExamForm((p) => ({
                  ...p,
                  proctorRequired: e.target.checked,
                }))
              }
            />
            <span>Proctoring Required</span>
          </label>

          {examForm.proctorRequired && (
            <>
              <div>
                <label className="label">Proctoring Mode</label>
                <select
                  className="input"
                  value={examForm.proctorMode}
                  onChange={(e) =>
                    setExamForm((p) => ({
                      ...p,
                      proctorMode: e.target.value,
                    }))
                  }
                >
                  <option value="BASIC">Basic (Screen monitoring only)</option>
                  <option value="WEBCAM">Webcam (Video required)</option>
                </select>
              </div>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={examForm.proctorScreenshareRequired}
                  onChange={(e) =>
                    setExamForm((p) => ({
                      ...p,
                      proctorScreenshareRequired: e.target.checked,
                    }))
                  }
                />
                <span>Require Screen Sharing</span>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Add Question</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="label">Question Type</label>
            <select
              className="input"
              value={newQuestion.type}
              onChange={(e) => {
                const t = e.target.value;
                if (t === "TRUE_FALSE") {
                  setNewQuestion((p) => ({
                    ...p,
                    type: t,
                    options: ["True", "False"],
                    correctAnswer: 0,
                  }));
                } else {
                  setNewQuestion((p) => ({
                    ...p,
                    type: t,
                    options: ["", "", "", ""],
                    correctAnswer: 0,
                  }));
                }
              }}
            >
              <option value="MCQ">Multiple Choice</option>
              <option value="TRUE_FALSE">True / False</option>
            </select>
          </div>

          <div>
            <label className="label">Question Text</label>
            <textarea
              className="input"
              rows={2}
              value={newQuestion.text}
              onChange={(e) =>
                setNewQuestion((p) => ({ ...p, text: e.target.value }))
              }
              placeholder="Enter the question..."
            />
          </div>

          <div>
            <label className="label">Marks</label>
            <input
              className="input"
              type="number"
              min="1"
              value={newQuestion.marks}
              onChange={(e) =>
                setNewQuestion((p) => ({
                  ...p,
                  marks: Number(e.target.value),
                }))
              }
            />
          </div>

          <div>
            <label className="label">Options</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {newQuestion.options.map((opt, idx) => (
                <div
                  key={idx}
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    className="input"
                    value={opt}
                    onChange={(e) => {
                      const updated = [...newQuestion.options];
                      updated[idx] = e.target.value;
                      setNewQuestion((p) => ({ ...p, options: updated }));
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    style={{ flex: 1 }}
                  />
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 0,
                    }}
                  >
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={newQuestion.correctAnswer === idx}
                      onChange={() =>
                        setNewQuestion((p) => ({
                          ...p,
                          correctAnswer: idx,
                        }))
                      }
                    />
                    Correct
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={addQuestion}
            disabled={busy || !newQuestion.text.trim()}
          >
            Add Question
          </button>
        </div>
      </div>

      {examForm.questions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>
            Questions ({examForm.questions.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {examForm.questions.map((q, qIdx) => (
              <details
                key={qIdx}
                style={{
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                  Q{qIdx + 1}. {q.text.substring(0, 50)}... ({q.marks} marks)
                </summary>
                <div style={{ marginTop: 12 }}>
                  <div>
                    <label className="label">Question Text</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={q.text}
                      onChange={(e) =>
                        updateQuestion(qIdx, "text", e.target.value)
                      }
                    />
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label className="label">Marks</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={q.marks}
                      onChange={(e) =>
                        updateQuestion(qIdx, "marks", Number(e.target.value))
                      }
                    />
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label className="label">Options</label>
                    {q.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <input
                          className="input"
                          value={opt}
                          onChange={(e) =>
                            updateOption(qIdx, oIdx, e.target.value)
                          }
                          style={{ flex: 1 }}
                        />
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 0,
                          }}
                        >
                          <input
                            type="radio"
                            name={`correct_${qIdx}`}
                            checked={q.correctAnswer === oIdx}
                            onChange={() =>
                              updateQuestion(qIdx, "correctAnswer", oIdx)
                            }
                          />
                          Correct
                        </label>
                      </div>
                    ))}
                  </div>

                  <button
                    className="btn-danger"
                    style={{ marginTop: 10 }}
                    onClick={() => removeQuestion(qIdx)}
                  >
                    Delete Question
                  </button>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn-primary"
          onClick={saveExam}
          disabled={busy || examForm.questions.length === 0}
          style={{ marginBottom: 16 }}
        >
          {exam ? "Update Exam" : "Create Exam"}
        </button>
        {exam && (
          <p className="muted" style={{ marginTop: 10 }}>
            ✓ Exam exists and can be updated
          </p>
        )}
      </div>
    </div>
  );
}
