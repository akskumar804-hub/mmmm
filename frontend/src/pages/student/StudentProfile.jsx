import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:4000/api"
).replace(/\/?api\/?$/, "");

export default function StudentProfile() {
  const { token } = useAuth();

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    name: "",
    dob: "",
    phone: "",
    latestEducation: "",
  });
  const [files, setFiles] = useState({
    photo: null,
    idCard: null,
    eduDoc: null,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const photoUrl = useMemo(
    () => (profile?.photoPath ? `${API_ORIGIN}${profile.photoPath}` : ""),
    [profile]
  );
  const idCardUrl = useMemo(
    () => (profile?.idCardPath ? `${API_ORIGIN}${profile.idCardPath}` : ""),
    [profile]
  );
  const eduDocUrl = useMemo(
    () => (profile?.eduDocPath ? `${API_ORIGIN}${profile.eduDocPath}` : ""),
    [profile]
  );

  const load = async () => {
    const res = await apiRequest("/student/profile", { token });
    setProfile(res.profile);
    setForm({
      name: res.profile?.name || "",
      dob: res.profile?.dob || "",
      phone: res.profile?.phone || "",
      latestEducation: res.profile?.latestEducation || "",
    });
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load profile");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await apiRequest("/student/profile", {
        method: "PUT",
        token,
        body: form,
      });
      setMessage("Profile updated.");
      await load();
    } catch (e2) {
      setError(e2.message || "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const fd = new FormData();
      if (files.photo) fd.append("photo", files.photo);
      if (files.idCard) fd.append("idCard", files.idCard);
      if (files.eduDoc) fd.append("eduDoc", files.eduDoc);
      await apiRequest("/student/profile/upload", {
        method: "POST",
        token,
        body: fd,
        isForm: true,
      });
      setMessage("Documents uploaded. Wait for admin profile approval.");
      setFiles({ photo: null, idCard: null, eduDoc: null });
      await load();
    } catch (e2) {
      setError(e2.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Student Profile</h1>
          <p className="page-subtitle">
            Upload your photo, ID card, and latest education document. Admin
            must approve profile before payment.
          </p>
        </div>
        {profile && (
          <span
            className={`status-pill ${
              profile.isProfileVerified ? "passed" : "pending"
            }`}
          >
            {profile.isProfileVerified ? "PROFILE APPROVED" : "PROFILE PENDING"}
          </span>
        )}
      </header>

      {message && <p className="status-pill pending">{message}</p>}
      {error && <p className="status-pill failed">{error}</p>}

      <div className="two-column">
        <section className="card" style={{ alignSelf: "start" }}>
          <h3 className="card-title">Basic details</h3>

          <form
            onSubmit={handleSave}
            className="form"
            style={{ marginTop: 12 }}
          >
            <label>
              Full name
              <br />
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <br />
            <label>
              Date of birth (DOB)
              <br />
              <input
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
                placeholder="YYYY-MM-DD"
              />
            </label>
            <br />
            <label>
              Phone
              <br />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <br />
            <label>
              Latest education (e.g., 12th / BSc / etc.)
              <br />
              <input
                value={form.latestEducation}
                onChange={(e) =>
                  setForm({ ...form, latestEducation: e.target.value })
                }
              />
            </label>
            <br />
            <br />
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>

        <section className="card" style={{ alignSelf: "start" }}>
          <h3 className="card-title">Upload documents</h3>
          <p className="muted" style={{ marginTop: 8 }}>
            Accepted: JPG/PNG/PDF. Max 8MB each.
          </p>

          <div className="form" style={{ marginTop: 12 }}>
            <label>
              Photo
              <br />
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setFiles((p) => ({
                    ...p,
                    photo: e.target.files?.[0] || null,
                  }))
                }
              />
              {photoUrl && (
                <a
                  className="muted"
                  href={photoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View uploaded photo
                </a>
              )}
            </label>
            <br />
            <label>
              ID Card
              <br />
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) =>
                  setFiles((p) => ({
                    ...p,
                    idCard: e.target.files?.[0] || null,
                  }))
                }
              />
              {idCardUrl && (
                <a
                  className="muted"
                  href={idCardUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View uploaded ID
                </a>
              )}
            </label>
            <br />
            <label>
              Education document
              <br />
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) =>
                  setFiles((p) => ({
                    ...p,
                    eduDoc: e.target.files?.[0] || null,
                  }))
                }
              />
              {eduDocUrl && (
                <a
                  className="muted"
                  href={eduDocUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View uploaded education doc
                </a>
              )}
            </label>
            <br />
            <br />
            <button
              className="btn-primary"
              type="button"
              onClick={handleUpload}
              disabled={
                busy || (!files.photo && !files.idCard && !files.eduDoc)
              }
            >
              {busy ? "Uploading..." : "Upload selected documents"}
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <h4
              className="section-title"
              style={{ margin: 0, fontSize: "1rem" }}
            >
              Security notes (exam window)
            </h4>
            <ul className="muted" style={{ lineHeight: 1.7 }}>
              <li>
                Prevent copy/paste (recommended), block right-click (optional).
              </li>
              <li>Full-screen prompt + exit detection (recommended).</li>
              <li>Disable multiple tabs (warn + log).</li>
              <li>Randomize question order (recommended).</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
