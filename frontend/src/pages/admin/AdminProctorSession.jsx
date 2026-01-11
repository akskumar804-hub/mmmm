import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { apiRequest } from '../../api/http.js'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const UPLOAD_BASE = API_BASE.replace(/\/api\/?$/, '')

function fmt(dt) {
  try {
    return new Date(dt).toLocaleString()
  } catch {
    return dt || ''
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export default function AdminProctorSession() {
  const { sessionId } = useParams()
  const nav = useNavigate()
  const { token } = useAuth()

  const [session, setSession] = useState(null)
  const [events, setEvents] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [attempt, setAttempt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [reviewStatus, setReviewStatus] = useState('PENDING')
  const [reviewNotes, setReviewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const data = await apiRequest(`/admin/proctor/sessions/${sessionId}`, { token })
        if (!mounted) return
        setSession(data.session || null)
        setEvents(data.events || [])
        setSnapshots(data.snapshots || [])
        setAttempt(data.attempt || null)
        setReviewStatus((data.session?.reviewStatus || 'PENDING').toUpperCase())
        setReviewNotes(data.session?.reviewNotes || '')
      } catch (e) {
        if (!mounted) return
        setError(e.message || 'Failed to load session')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [token, sessionId])

  const eventSummary = useMemo(() => {
    const counts = {}
    for (const ev of events) {
      const k = (ev.eventType || '').toUpperCase()
      counts[k] = (counts[k] || 0) + 1
    }
    return counts
  }, [events])

  async function saveReview() {
    try {
      setSaving(true)
      await apiRequest(`/admin/proctor/sessions/${sessionId}/review`, {
        token,
        method: 'POST',
        body: { reviewStatus, reviewNotes }
      })
      alert('Saved')
    } catch (e) {
      alert(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Session #{sessionId}</h2>
          <div className="muted">Proctoring details: events, snapshots, review & linked attempt.</div>
        </div>
        <button className="btn" onClick={() => nav(-1)}>Back</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading...</div>}

      {!loading && session && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div>
                <div className="muted">Student</div>
                <div style={{ fontWeight: 700 }}>{session.studentName || 'Student'}</div>
                <div className="muted" style={{ fontSize: 12 }}>{session.studentEmail}</div>
              </div>
              <div>
                <div className="muted">Course / Subject</div>
                <div style={{ fontWeight: 700 }}>{session.courseTitle}</div>
                <div className="muted" style={{ fontSize: 12 }}>{session.subjectName}</div>
              </div>
              <div>
                <div className="muted">Timing</div>
                <div><strong>Start:</strong> {fmt(session.startedAt)}</div>
                <div><strong>End:</strong> {session.endedAt ? fmt(session.endedAt) : <span className="muted">—</span>}</div>
              </div>
              <div>
                <div className="muted">Signals</div>
                <div><strong>Warnings:</strong> {session.warningCount}</div>
                <div><strong>Suspicious score:</strong> {session.suspiciousScore}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {session.mode === 'WEBCAM' ? 'Webcam enabled' : 'Webcam not enabled'} • {session.screenshareEnabled ? 'Screen share enabled' : 'Screen share not enabled'}
                </div>
              </div>
              <div>
                <div className="muted">Client</div>
                <div className="muted" style={{ fontSize: 12 }}>{session.ipAddress || '—'}</div>
                <div className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{session.userAgent || '—'}</div>
                {session.fingerprint ? <div className="muted" style={{ fontSize: 12 }}>fp: {session.fingerprint}</div> : null}
              </div>
            </div>
          </div>

          {attempt && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Linked Attempt</h3>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span className="badge">Attempt #{attempt.attemptNo}</span>
                <span className="badge">{attempt.passed ? 'PASSED' : 'FAILED'}</span>
                <span className="badge">Score: {attempt.scorePercent}%</span>
                <span className="badge">Submitted: {fmt(attempt.submittedAt)}</span>
                <span className="badge">Release: {fmt(attempt.resultReleaseAt)}</span>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Review</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="input" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
                <option value="PENDING">PENDING</option>
                <option value="CLEARED">CLEARED</option>
                <option value="FLAGGED">FLAGGED</option>
              </select>
              <button className="btn" onClick={saveReview} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <textarea
              className="input"
              style={{ marginTop: 10, width: '100%', minHeight: 90 }}
              placeholder="Notes (why flagged/cleared, evidence, etc.)"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Event Summary</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(eventSummary).length === 0 ? (
                <span className="muted">No events</span>
              ) : (
                Object.entries(eventSummary).map(([k, v]) => (
                  <span key={k} className="badge">{k}: {v}</span>
                ))
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Events (chronological)</h3>
            {!events.length ? (
              <div className="muted">No events recorded.</div>
            ) : (
              <div style={{ maxHeight: 340, overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const meta = typeof e.meta === 'string' ? safeJsonParse(e.meta) : e.meta
                      return (
                        <tr key={e.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmt(e.createdAt)}</td>
                          <td><span className="badge">{e.eventType}</span></td>
                          <td style={{ fontSize: 12 }}>
                            {meta ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(meta, null, 2)}</pre> : <span className="muted">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Snapshots</h3>
            {!snapshots.length ? (
              <div className="muted">No snapshots uploaded.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {snapshots.map((s) => (
                  <div key={s.id} className="card" style={{ padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span className="badge">{s.snapshotType || 'WEBCAM'}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{fmt(s.createdAt)}</span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <img
                        src={`${UPLOAD_BASE}/uploads/${s.filePath}`}
                        alt="snapshot"
                        style={{ width: '100%', borderRadius: 10, display: 'block' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
