import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { apiRequest } from '../../api/http.js'

export default function AdminCertificates() {
  const { token } = useAuth()
  const [certificates, setCertificates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await apiRequest('/admin/certificates', { token })
        if (!mounted) return
        setCertificates(res.certificates || [])
      } catch (e) {
        if (!mounted) return
        setError(e.message || 'Failed to load certificates')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [token])

  return (
    <div className="card">
      <h2 className="section-title">Certificates</h2>
      <p className="section-helper">
        Certificates are issued when an enrollment is marked <strong>COMPLETED</strong>.
      </p>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && !error && certificates.length === 0 && <p className="muted">No certificates issued yet.</p>}

      {certificates.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Certificate #</th>
                <th>Student</th>
                <th>Email</th>
                <th>Course</th>
                <th>Issued at</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((c) => (
                <tr key={c.certificateNo}>
                  <td>{c.certificateNo}</td>
                  <td>{c.studentName || '—'}</td>
                  <td>{c.studentEmail}</td>
                  <td>
                    <strong>{c.courseTitle}</strong>
                    <div className="muted">{c.courseCode}</div>
                  </td>
                  <td>{c.issuedAt ? new Date(c.issuedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
