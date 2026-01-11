import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { apiRequest } from "../../api/http.js";

export default function StudentCertificates() {
  const { token } = useAuth();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCert, setSelectedCert] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiRequest("/student/certificates", { token });
        if (!mounted) return;
        setCertificates(res.certificates || []);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load certificates");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const generateCertificatePDF = (cert) => {
    // Generate a simple PDF certificate using HTML to PDF (client-side with a library)
    // For now, we'll create a downloadable HTML version
    const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Certificate - ${cert.certificateNo}</title>
        <style>
          body { font-family: 'Georgia', serif; margin: 0; padding: 0; }
          .certificate { 
            width: 100%; max-width: 8.5in; height: 11in; 
            margin: auto; padding: 40px; box-sizing: border-box;
            border: 3px solid #1a5f7a; 
            text-align: center; 
            background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
            page-break-after: always;
          }
          .header { font-size: 36px; font-weight: bold; color: #1a5f7a; margin-bottom: 20px; }
          .subtitle { font-size: 18px; color: #666; margin-bottom: 40px; }
          .content { margin: 40px 0; }
          .awarded { font-size: 16px; color: #333; margin: 20px 0; }
          .name { font-size: 24px; font-weight: bold; color: #1a5f7a; margin: 20px 0; border-bottom: 2px solid #1a5f7a; padding-bottom: 10px; }
          .course { font-size: 18px; color: #333; margin: 30px 0; }
          .details { font-size: 14px; color: #666; margin: 30px 0; }
          .cert-no { font-size: 12px; color: #999; margin-top: 20px; font-style: italic; }
          .date { margin-top: 40px; font-size: 14px; color: #666; }
        </style>
      </head>
      <body>
        <div class="certificate">
          <div class="header">Certificate of Completion</div>
          <div class="subtitle">This certifies that</div>
          <div class="name">${cert.studentName}</div>
          <div class="awarded">has successfully completed the course</div>
          <div class="course">${cert.courseTitle}</div>
          <div class="details">and demonstrated the knowledge and skills required to master the subject matter.</div>
          <div class="date">Issued: ${new Date(
            cert.issuedAt
          ).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}</div>
          <div class="cert-no">Certificate #: ${cert.certificateNo}</div>
        </div>
      </body>
    </html>
    `;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.certificateNo}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const viewCertificate = (cert) => {
    setSelectedCert(cert);
  };

  if (selectedCert) {
    return (
      <div>
        <header className="page-header">
          <div>
            <h1 className="page-title">Certificate Preview</h1>
            <div className="muted">
              Certificate #: {selectedCert.certificateNo}
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={() => setSelectedCert(null)}
          >
            Back
          </button>
        </header>

        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "60px 40px",
            border: "3px solid var(--primary)",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: "bold",
              color: "var(--primary)",
              marginBottom: 20,
            }}
          >
            Certificate of Completion
          </div>
          <div style={{ fontSize: 18, color: "#666", marginBottom: 40 }}>
            This certifies that
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: "bold",
              color: "var(--primary)",
              marginBottom: 20,
              borderBottom: "2px solid var(--primary)",
              paddingBottom: 10,
            }}
          >
            {selectedCert.studentName}
          </div>
          <div style={{ fontSize: 16, color: "#333", marginBottom: 30 }}>
            has successfully completed the course
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: "600",
              color: "#333",
              marginBottom: 30,
            }}
          >
            {selectedCert.courseTitle}
          </div>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 30 }}>
            and demonstrated the knowledge and skills required to master the
            subject matter.
          </div>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 40 }}>
            Issued:{" "}
            {new Date(selectedCert.issuedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#999",
              fontStyle: "italic",
              marginBottom: 40,
            }}
          >
            Certificate #: {selectedCert.certificateNo}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginTop: 20,
          }}
        >
          <button
            className="btn-primary"
            onClick={() => generateCertificatePDF(selectedCert)}
          >
            Download as HTML
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button
            className="btn-secondary"
            onClick={() => setSelectedCert(null)}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Certificates</h1>
          <p className="page-subtitle">
            Your earned certificates appear here after passing course exams.
          </p>
        </div>
        <Link className="btn-secondary" to="/student/courses">
          Back to Courses
        </Link>
      </header>

      {loading && <p className="muted">Loading certificates...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && !error && certificates.length === 0 && (
        <div className="card">
          <p className="muted">No certificates earned yet.</p>
          <p className="muted" style={{ fontSize: 14 }}>
            Complete a course and pass the final exam to earn a certificate.
          </p>
        </div>
      )}

      {certificates.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="card"
              style={{ padding: 20, borderLeft: "4px solid var(--primary)" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "start",
                  marginBottom: 12,
                }}
              >
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                    <strong>{cert.courseTitle}</strong>
                  </h3>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Code: {cert.courseCode}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 20 }}>
                  ✓
                </div>
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Issued:{" "}
                {new Date(cert.issuedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#1a5f7a",
                  marginBottom: 12,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                }}
              >
                {cert.certificateNo}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, padding: "6px 12px", fontSize: 13 }}
                  onClick={() => viewCertificate(cert)}
                >
                  View
                </button>
                <button
                  className="btn-secondary"
                  style={{ flex: 1, padding: "6px 12px", fontSize: 13 }}
                  onClick={() => generateCertificatePDF(cert)}
                >
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
