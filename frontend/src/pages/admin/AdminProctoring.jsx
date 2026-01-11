import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { apiRequest } from '../../api/http.js'

function fmt(dt) {
  try {
    return new Date(dt).toLocaleString()
  } catch {
    return dt || ''
  }
}

export default function AdminProctoring() {
  const { token } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [review, setReview] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const params = new URLSearchParams()
        if (q.trim()) params.set('q', q.trim())
        if (status) params.set('status', status)
        if (review) params.set('review', review)
        const data = await apiRequest(`/admin/proctor/sessions?${params.toString()}`, { token })
        if (!mounted) return
        setSessions(data.sessions || [])
      } catch (e) {
        if (!mounted) return
        setError(e.message || 'Failed to load proctor sessions')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [token, refreshKey])

  const stats = useMemo(() => {
    const total = sessions.length
    const flagged = sessions.filter((s) => (s.reviewStatus || '').toUpperCase() === 'FLAGGED').length
    const pending = sessions.filter((s) => (s.reviewStatus || '').toUpperCase() === 'PENDING').length
    return { total, flagged, pending }
  }, [sessions])

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Proctoring Sessions</h2>
            <div className="muted">Track warnings, events, snapshots and review flagged sessions.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge">Total: {stats.total}</span>
            <span className="badge">Pending: {stats.pending}</span>
            <span className="badge">Flagged: {stats.flagged}</span>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Search by student email/name or session ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />

          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="ENDED">ENDED</option>
          </select>

          <select className="input" value={review} onChange={(e) => setReview(e.target.value)}>
            <option value="">All review</option>
            <option value="PENDING">PENDING</option>
            <option value="CLEARED">CLEARED</option>
            <option value="FLAGGED">FLAGGED</option>
          </select>

          <button
            className="btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            title="Refresh"
          >
            Refresh
          </button>
        </div>

        <div className="muted" style={{ marginTop: 8 }}>
          Tip: filter “PENDING” to review suspicious sessions quickly.
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="muted">Loading...</div>}

      {!loading && !sessions.length && <div className="muted">No sessions found.</div>}

      {!!sessions.length && (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Student</th>
                  <th>Course / Subject</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Review</th>
                  <th>Warnings</th>
                  <th>Events</th>
                  <th>Snaps</th>
                  <th>Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId}>
                    <td>#{s.sessionId}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.studentName || 'Student'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.studentEmail}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.courseTitle}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.subjectName}</div>
                    </td>
                    <td>{fmt(s.startedAt)}</td>
                    <td>
                      <span className="badge">{s.status}</span>
                      {s.screenshareEnabled ? <span className="badge" style={{ marginLeft: 6 }}>Screen</span> : null}
                      {s.mode === 'WEBCAM' ? <span className="badge" style={{ marginLeft: 6 }}>Webcam</span> : null}
                    </td>
                    <td>
                      <span className={'badge ' + ((s.reviewStatus || '').toUpperCase() === 'FLAGGED' ? 'badge-danger' : '')}>
                        {s.reviewStatus || 'PENDING'}
                      </span>
                    </td>
                    <td>{s.warningCount}</td>
                    <td>{s.eventsCount}</td>
                    <td>{s.snapshotsCount}</td>
                    <td>{s.suspiciousScore}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="btn btn-sm" to={`/admin/proctoring/${s.sessionId}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
