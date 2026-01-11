import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

function move(arr, from, to) {
  const copy = [...arr];
  const item = copy.splice(from, 1)[0];
  copy.splice(to, 0, item);
  return copy;
}

export default function AdminCourseBuilder() {
  const { token } = useAuth();
  const { courseId } = useParams();
  const cid = Number(courseId);

  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newModule, setNewModule] = useState({ title: "", description: "" });
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const res = await apiRequest(`/admin/courses/${cid}/content`, { token });
    setCourse(res.course);
    setModules(res.modules || []);
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

  const addModule = async () => {
    if (!newModule.title.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/courses/${cid}/modules`, {
        method: "POST",
        token,
        body: newModule,
      });
      setNewModule({ title: "", description: "" });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to add module");
    } finally {
      setBusy(false);
    }
  };

  const updateModule = async (moduleId, patch) => {
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/modules/${moduleId}`, {
        method: "PUT",
        token,
        body: patch,
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to update module");
    } finally {
      setBusy(false);
    }
  };

  const deleteModule = async (moduleId) => {
    if (!confirm("Delete this module (and its lessons)?")) return;
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/modules/${moduleId}`, {
        method: "DELETE",
        token,
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to delete module");
    } finally {
      setBusy(false);
    }
  };

  const reorderModules = async (nextModules) => {
    setModules(nextModules);
    try {
      await apiRequest(`/admin/courses/${cid}/modules/reorder`, {
        method: "PUT",
        token,
        body: { moduleIds: nextModules.map((m) => m.id) },
      });
    } catch {
      // ignore
    }
  };

  const addLesson = async (moduleId, payload) => {
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/modules/${moduleId}/lessons`, {
        method: "POST",
        token,
        body: payload,
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to add lesson");
    } finally {
      setBusy(false);
    }
  };

  const updateLesson = async (lessonId, patch) => {
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/lessons/${lessonId}`, {
        method: "PUT",
        token,
        body: patch,
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to update lesson");
    } finally {
      setBusy(false);
    }
  };

  const deleteLesson = async (lessonId) => {
    if (!confirm("Delete this lesson?")) return;
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/lessons/${lessonId}`, {
        method: "DELETE",
        token,
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to delete lesson");
    } finally {
      setBusy(false);
    }
  };

  const reorderLessons = async (moduleId, nextLessons) => {
    try {
      await apiRequest(`/admin/modules/${moduleId}/lessons/reorder`, {
        method: "PUT",
        token,
        body: { lessonIds: nextLessons.map((l) => l.id) },
      });
    } catch {
      // ignore
    }
  };

  const uploadResource = async (lessonId, file) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiRequest(`/admin/lessons/${lessonId}/resources/upload`, {
        method: "POST",
        token,
        body: fd,
        isForm: true,
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const addResourceLink = async (lessonId, url, title) => {
    if (!url?.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/lessons/${lessonId}/resources/link`, {
        method: "POST",
        token,
        body: { url, title },
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to add link");
    } finally {
      setBusy(false);
    }
  };

  const removeResource = async (resourceId) => {
    if (!confirm("Remove this resource?")) return;
    setBusy(true);
    setErr("");
    try {
      await apiRequest(`/admin/resources/${resourceId}`, {
        method: "DELETE",
        token,
      });
      await reload();
    } catch (e) {
      setErr(e.message || "Failed to remove");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading...</p>;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Course Builder</h1>
          <p className="page-subtitle">
            Create modules, lessons (video/text/pdf/link) and resources.
            Students must complete lessons to unlock exams.
          </p>
          {course && (
            <div className="muted">
              Course: <strong>{course.title}</strong>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn-secondary" to="/admin/courses">
            Back
          </Link>
          <Link className="btn-primary" to={`/admin/courses/${cid}/exams`}>
            Exam Builder
          </Link>
          <Link className="btn-primary" to="/admin/analytics">
            Analytics
          </Link>
        </div>
      </header>

      {err && <p className="status-pill failed">{err}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Add Module</h2>
        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}
        >
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={newModule.title}
              onChange={(e) =>
                setNewModule((p) => ({ ...p, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input
              className="input"
              value={newModule.description}
              onChange={(e) =>
                setNewModule((p) => ({ ...p, description: e.target.value }))
              }
            />
          </div>
          <button
            className="btn-primary"
            type="button"
            disabled={busy || !newModule.title.trim()}
            onClick={addModule}
          >
            Add
          </button>
        </div>
      </div>

      {modules.length === 0 && <p className="muted">No modules yet.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {modules.map((m, idx) => (
          <div key={m.id} className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{m.title}</div>
                {m.description && <div className="muted">{m.description}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn-secondary"
                  disabled={idx === 0}
                  onClick={() => reorderModules(move(modules, idx, idx - 1))}
                >
                  Up
                </button>
                <button
                  className="btn-secondary"
                  disabled={idx === modules.length - 1}
                  onClick={() => reorderModules(move(modules, idx, idx + 1))}
                >
                  Down
                </button>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    updateModule(m.id, { isPublished: m.isPublished ? 0 : 1 })
                  }
                >
                  {m.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const t = prompt("Module title", m.title);
                    if (t === null) return;
                    const d = prompt("Module description", m.description || "");
                    updateModule(m.id, { title: t, description: d });
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn-danger"
                  onClick={() => deleteModule(m.id)}
                >
                  Delete
                </button>
              </div>
            </div>

            <ModuleLessons
              module={m}
              busy={busy}
              onAddLesson={addLesson}
              onUpdateLesson={updateLesson}
              onDeleteLesson={deleteLesson}
              onReorderLessons={reorderLessons}
              onUploadResource={uploadResource}
              onAddResourceLink={addResourceLink}
              onRemoveResource={removeResource}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ModuleLessons({
  module,
  busy,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onReorderLessons,
  onUploadResource,
  onAddResourceLink,
  onRemoveResource,
}) {
  const [draft, setDraft] = useState({
    title: "",
    lessonType: "text",
    contentText: "",
    contentUrl: "",
    estimatedMinutes: "",
  });

  const lessons = useMemo(() => module.lessons || [], [module.lessons]);

  const submit = async () => {
    if (!draft.title.trim()) return;
    const payload = {
      title: draft.title,
      lessonType: draft.lessonType,
      contentText: draft.lessonType === "text" ? draft.contentText : "",
      contentUrl: draft.lessonType !== "text" ? draft.contentUrl : "",
      estimatedMinutes: draft.estimatedMinutes
        ? Number(draft.estimatedMinutes)
        : null,
    };
    await onAddLesson(module.id, payload);
    setDraft({
      title: "",
      lessonType: "text",
      contentText: "",
      contentUrl: "",
      estimatedMinutes: "",
    });
  };

  const moveLesson = async (from, to) => {
    const next = move(lessons, from, to);
    await onReorderLessons(module.id, next);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ marginBottom: 8 }}>Lessons</h3>
      <div
        className="card"
        style={{ background: "var(--panel)", padding: 12, marginBottom: 12 }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: "1.2fr 0.7fr 1fr 0.7fr auto",
            alignItems: "end",
          }}
        >
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={draft.title}
              onChange={(e) =>
                setDraft((p) => ({ ...p, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={draft.lessonType}
              onChange={(e) =>
                setDraft((p) => ({ ...p, lessonType: e.target.value }))
              }
            >
              <option value="text">Text</option>
              <option value="video">Video URL</option>
              <option value="pdf">PDF URL</option>
              <option value="link">External Link</option>
            </select>
          </div>
          <div>
            <label className="label">Content</label>
            {draft.lessonType === "text" ? (
              <textarea
                className="input"
                rows={2}
                value={draft.contentText}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, contentText: e.target.value }))
                }
              />
            ) : (
              <input
                className="input"
                placeholder="https://..."
                value={draft.contentUrl}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, contentUrl: e.target.value }))
                }
              />
            )}
          </div>
          <div>
            <label className="label">Est. min</label>
            <input
              className="input"
              type="number"
              min="0"
              value={draft.estimatedMinutes}
              onChange={(e) =>
                setDraft((p) => ({ ...p, estimatedMinutes: e.target.value }))
              }
            />
          </div>
          <button
            className="btn-primary"
            type="button"
            disabled={busy || !draft.title.trim()}
            onClick={submit}
          >
            Add
          </button>
        </div>
      </div>

      {lessons.length === 0 && <p className="muted">No lessons yet.</p>}

      {lessons.map((l, idx) => (
        <details key={l.id} style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            {idx + 1}. {l.title} <span className="muted">({l.lessonType})</span>
          </summary>
          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ marginBottom: 8 }}>
              Published: <strong>{l.isPublished ? "Yes" : "No"}</strong>
              {l.estimatedMinutes ? ` • Est: ${l.estimatedMinutes} min` : ""}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn-secondary"
                disabled={idx === 0}
                onClick={() => moveLesson(idx, idx - 1)}
              >
                Up
              </button>
              <button
                className="btn-secondary"
                disabled={idx === lessons.length - 1}
                onClick={() => moveLesson(idx, idx + 1)}
              >
                Down
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  onUpdateLesson(l.id, { isPublished: l.isPublished ? 0 : 1 })
                }
              >
                {l.isPublished ? "Unpublish" : "Publish"}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  const title = prompt("Lesson title", l.title);
                  if (title === null) return;
                  const est = prompt(
                    "Estimated minutes (number)",
                    l.estimatedMinutes || ""
                  );
                  const type = prompt(
                    "Lesson type (text/video/pdf/link)",
                    l.lessonType
                  );
                  let contentText = l.contentText || "";
                  let contentUrl = l.contentUrl || "";
                  if (type === "text") {
                    contentText =
                      prompt("Text content", contentText) ?? contentText;
                    contentUrl = "";
                  } else {
                    contentUrl = prompt("URL", contentUrl) ?? contentUrl;
                    contentText = "";
                  }
                  onUpdateLesson(l.id, {
                    title,
                    lessonType: type,
                    estimatedMinutes: est ? Number(est) : null,
                    contentText,
                    contentUrl,
                  });
                }}
              >
                Edit
              </button>
              <button
                className="btn-danger"
                onClick={() => onDeleteLesson(l.id)}
              >
                Delete
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <h4 style={{ marginBottom: 6 }}>Resources</h4>
              {(l.resources || []).length === 0 && (
                <p className="muted">No resources.</p>
              )}
              {(l.resources || []).length > 0 && (
                <ul style={{ marginTop: 0 }}>
                  {(l.resources || []).map((r) => (
                    <li key={r.id} style={{ marginBottom: 6 }}>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.title || r.url}
                        </a>
                      ) : (
                        <a href={r.path} target="_blank" rel="noreferrer">
                          {r.title || r.path}
                        </a>
                      )}
                      <button
                        className="btn-link"
                        style={{ marginLeft: 10 }}
                        type="button"
                        onClick={() => onRemoveResource(r.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div
                className="grid"
                style={{
                  gridTemplateColumns: "1fr 0.6fr",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <div>
                  <label className="label">Add link resource</label>
                  <AddLink
                    onAdd={(url, title) => onAddResourceLink(l.id, url, title)}
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="label">Upload file (PDF/image)</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={busy}
                    onChange={(e) =>
                      onUploadResource(l.id, e.target.files?.[0])
                    }
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    For production, use S3/Cloudinary (Render disk is
                    ephemeral).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function AddLink({ onAdd, disabled }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        className="input"
        placeholder="https://..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={disabled}
        style={{ minWidth: 220 }}
      />
      <input
        className="input"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={disabled}
        style={{ minWidth: 180 }}
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled || !url.trim()}
        onClick={() => {
          onAdd(url, title);
          setUrl("");
          setTitle("");
        }}
      >
        Add
      </button>
    </div>
  );
}
