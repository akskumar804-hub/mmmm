import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

export default function AdminCourses() {
  const { token } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: "",
    title: "",
    shortDescription: "",
    description: "",
    tuitionFee: "16000",
    level: "Undergraduate",
    duration: "2 Years",
  });

  const load = async () => {
    const res = await apiRequest("/admin/courses", { token });
    setCourses(res.courses || []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load courses");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleChange = (field, value) =>
    setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/admin/courses", {
        method: "POST",
        token,
        body: {
          code: form.code || undefined,
          title: form.title,
          shortDescription: form.shortDescription || undefined,
          description: form.description || undefined,
          level: form.level || undefined,
          duration: form.duration || undefined,
          tuitionFee: Number(form.tuitionFee) || 0,
        },
      });
      setForm({
        code: "",
        title: "",
        shortDescription: "",
        description: "",
        tuitionFee: "16000",
        level: "Undergraduate",
        duration: "2 Years",
      });
      await load();
    } catch (e2) {
      setError(e2.message || "Failed to create course");
    } finally {
      setBusy(false);
    }
  };

  const removeCourse = async (courseId) => {
    if (!confirm("Delete this course?")) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/admin/courses/${courseId}`, {
        method: "DELETE",
        token,
      });
      await load();
    } catch (e) {
      setError(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <h2 className="section-title">Manage courses</h2>
        <p className="section-helper">
          Admission fee is fixed at ₹3000. Set tuition fee course-wise (paid
          once). You can also define content types in <code>contentJson</code>{" "}
          later.
        </p>
      </div>

      <div className="card" style={{ marginBottom: "12px" }}>
        <h3 className="section-title" style={{ fontSize: "1rem" }}>
          Add new course
        </h3>
        <form
          onSubmit={handleSubmit}
          className="auth-form"
          style={{ marginBottom: 0 }}
        >
          <div className="form-group">
            <label>Code (optional)</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => handleChange("code", e.target.value)}
              placeholder="e.g. BSC-CS"
            />
          </div>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Short description</label>
            <input
              type="text"
              value={form.shortDescription}
              onChange={(e) => handleChange("shortDescription", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Tuition fee (₹)</label>
            <input
              type="number"
              value={form.tuitionFee}
              onChange={(e) => handleChange("tuitionFee", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Level</label>
            <select
              value={form.level}
              onChange={(e) => handleChange("level", e.target.value)}
            >
              <option value="Undergraduate">Undergraduate</option>
              <option value="Postgraduate">Postgraduate</option>
              <option value="Diploma">Diploma</option>
              <option value="Certificate">Certificate</option>
            </select>
          </div>
          <div className="form-group">
            <label>Duration</label>
            <input
              type="text"
              value={form.duration}
              onChange={(e) => handleChange("duration", e.target.value)}
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button
            type="submit"
            className="btn-primary"
            style={{ width: "180px" }}
            disabled={busy}
          >
            {busy ? "Saving..." : "Save course"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="section-title" style={{ fontSize: "1rem" }}>
          All courses ({courses.length})
        </h3>

        {loading && <p className="muted">Loading...</p>}

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Level</th>
                <th>Fees</th>
                <th>Duration</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td>{course.code || "—"}</td>
                  <td>{course.title}</td>
                  <td>{course.level || "—"}</td>
                  <td>
                    <div className="muted">
                      Admission ₹{course.admissionFee ?? 3000}
                    </div>
                    <div className="muted">
                      Tuition ₹{course.tuitionFee ?? 0}
                    </div>
                    <div>
                      <strong>
                        Total ₹
                        {(course.admissionFee ?? 3000) +
                          (course.tuitionFee ?? 0)}
                      </strong>
                    </div>
                  </td>
                  <td>{course.duration || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        className="btn-secondary"
                        to={`/admin/courses/${course.id}/builder`}
                      >
                        Builder
                      </Link>
                      <Link
                        className="btn-secondary"
                        to={`/admin/courses/${course.id}/exams`}
                      >
                        Exams
                      </Link>
                      <button
                        className="btn-secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => removeCourse(course.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
