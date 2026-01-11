import React, { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { apiRequest } from '../../api/http.js'

export default function AdminResults() {
  const { token } = useAuth()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await apiRequest('/admin/results', { token })
        if (!mounted) return
        setResults(res.results || [])
      } catch (e) {
        if (!mounted) return
        setError(e.message || 'Failed to load results')
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
      <h2 className="section-title">Exam attempts & results</h2>
      <p className="section-helper">
        Exams are auto-evaluated at submission time, but the result is visible to students only after the release date.
      </p>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && !error && results.length === 0 && <p className="muted">No exam attempts yet.</p>}

      {results.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Course</th>
                <th>Subject</th>
                <th>Attempt #</th>
                <th>Score</th>
                <th>Status</th>
                <th>Evaluated</th>
                <th>Result release</th>
                <th>Proctor</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>{r.studentName || '—'}</td>
                  <td>{r.studentEmail}</td>
                  <td>{r.courseTitle}</td>
                  <td>{r.subjectName}</td>
                  <td>#{r.attemptNo}</td>
                  <td>{typeof r.scorePercent === 'number' ? `${r.scorePercent}%` : '—'}</td>
                  <td>
                    <span className={`status-pill ${r.passed ? 'passed' : 'failed'}`}>{r.passed ? 'Passed' : 'Failed'}</span>
                  </td>
                  <td>{r.evaluatedAt ? new Date(r.evaluatedAt).toLocaleString() : '—'}</td>
                  <td>{r.resultReleaseAt ? new Date(r.resultReleaseAt).toLocaleString() : '—'}</td>
                  <td>
                    {r.proctorSessionId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`status-pill ${r.proctorWarningCount > 0 ? 'pending' : 'passed'}`}>
                          {r.proctorWarningCount || 0} warning(s)
                        </span>
                        {r.proctorFlags ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '6px 10px' }}
                            onClick={() => window.alert(r.proctorFlags)}
                          >
                            View
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
