import React, { useMemo, useState } from 'react'
import { apiRequest } from '../api/http.js'

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/?api\/?$/, '')

export default function Verify() {
  const [enrollmentNo, setEnrollmentNo] = useState('')
  const [dob, setDob] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const photoUrl = useMemo(() => (result?.student?.photoPath ? `${API_ORIGIN}${result.student.photoPath}` : ''), [result])

  const handleVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await apiRequest('/public/verify', {
        method: 'POST',
        body: { enrollmentNo: enrollmentNo.trim(), dob: dob.trim() }
      })
      setResult(res)
    } catch (e2) {
      setError(e2.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Public Verification</h1>
          <p className="page-subtitle">
            Verify course completion using Enrollment No + Date of Birth (DOB).
          </p>
        </div>
      </header>

      <div className="card">
        <h3 className="card-title">Verify a student</h3>

        <form className="auth-form" onSubmit={handleVerify} style={{ marginTop: 12 }}>
          <div className="form-group">
            <label>Enrollment No</label>
            <input value={enrollmentNo} onChange={(e) => setEnrollmentNo(e.target.value)} placeholder="e.g. ENR-2025-000123" required />
          </div>
          <div className="form-group">
            <label>DOB (YYYY-MM-DD)</label>
            <input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="YYYY-MM-DD" required />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>

      {result?.ok && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="card-title">Verification Result</h3>

          <div className="two-column" style={{ marginTop: 12 }}>
            <div className="card" style={{ background: 'rgba(15, 23, 42, 0.35)' }}>
              <h4 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>Student</h4>
              <p style={{ marginTop: 10 }}>
                <strong>{result.student?.name || '—'}</strong><br />
                <span className="muted">{result.student?.email || '—'}</span>
              </p>
              <p className="muted" style={{ marginTop: 6 }}>Enrollment No: <strong>{result.enrollment?.enrollmentNo}</strong></p>
              <p className="muted" style={{ marginTop: 6 }}>Status: <strong>{result.enrollment?.status}</strong></p>
              {photoUrl && (
                <div style={{ marginTop: 12 }}>
                  <img src={photoUrl} alt="Student" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 12 }} />
                </div>
              )}
            </div>

            <div className="card" style={{ background: 'rgba(15, 23, 42, 0.35)' }}>
              <h4 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>Course</h4>
              <p style={{ marginTop: 10 }}>
                <strong>{result.course?.title || '—'}</strong><br />
                <span className="muted">{result.course?.code || ''}</span>
              </p>

              {result.certificate ? (
                <>
                  <p className="muted" style={{ marginTop: 10 }}>Certificate No: <strong>{result.certificate.certificateNo}</strong></p>
                  <p className="muted" style={{ marginTop: 6 }}>Issued at: <strong>{new Date(result.certificate.issuedAt).toLocaleString()}</strong></p>
                </>
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>Certificate not issued yet.</p>
              )}
            </div>
          </div>

          <p className="muted" style={{ marginTop: 10 }}>
            Note: Results are auto-evaluated but displayed only after 3 days. Verification shows completion details only after the course is marked completed.
          </p>
        </div>
      )}
    </div>
  )
}
