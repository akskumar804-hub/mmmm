import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiRequest } from '../../api/http.js'
import { useAuth } from '../../auth/AuthContext.jsx'

function fmtTime(seconds = 0) {
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h > 0) return `${h}h ${mm}m`
  return `${m}m`
}

export default function StudentLearnCourse() {
  const { courseId } = useParams()
  const cid = Number(courseId)
  const { token } = useAuth()

  const [course, setCourse] = useState(null)
  const [modules, setModules] = useState([])
  const [progress, setProgress] = useState(null)
  const [activeLesson, setActiveLesson] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const heartbeatRef = useRef(null)
  const lastTickRef = useRef(Date.now())

  const allLessons = useMemo(() => modules.flatMap((m) => m.lessons || []), [modules])

  const reload = async () => {
    const res = await apiRequest(`/student/courses/${cid}/content`, { token })
    setCourse(res.course)
    setModules(res.modules || [])
    setProgress(res.courseProgress)
    // Keep active lesson in sync
    if (activeLesson) {
      const updated = (res.modules || []).flatMap((m) => m.lessons || []).find((l) => l.id === activeLesson.id)
      if (updated) setActiveLesson(updated)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        await reload()
      } catch (e) {
        if (!mounted) return
        setErr(e.message || 'Failed to load course content')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, token])

  // Start/stop heartbeat when active lesson changes
  useEffect(() => {
    if (!activeLesson) return

    let stopped = false
    const start = async () => {
      try {
        await apiRequest(`/student/lessons/${activeLesson.id}/start`, { method: 'POST', token })
      } catch {
        // ignore
      }
      lastTickRef.current = Date.now()
      heartbeatRef.current = setInterval(async () => {
        if (stopped) return
        const now = Date.now()
        const delta = Math.max(1, Math.min(120, Math.round((now - lastTickRef.current) / 1000)))
        lastTickRef.current = now
        try {
          await apiRequest(`/student/lessons/${activeLesson.id}/heartbeat`, { method: 'POST', token, body: { deltaSeconds: delta } })
          // We do not reload every tick to keep it light
        } catch {
          // ignore
        }
      }, 20000)
    }

    start()

    return () => {
      stopped = true
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [activeLesson?.id, token])

  const markComplete = async (lessonId) => {
    setBusy(true)
    setErr('')
    try {
      await apiRequest(`/student/lessons/${lessonId}/complete`, { method: 'POST', token })
      await reload()
    } catch (e) {
      setErr(e.message || 'Failed to mark complete')
    } finally {
      setBusy(false)
    }
  }

  const openLesson = (lesson) => {
    setActiveLesson(lesson)
  }

  if (loading) return <p className="muted">Loading...</p>

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Learn: {course?.title || 'Course'}</h1>
          <p className="page-subtitle">Complete all lessons to unlock exams.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn-secondary" to="/student/my-courses">Back</Link>
          <Link className="btn-primary" to="/student/exams">Exams</Link>
        </div>
      </header>

      {err && <p className="status-pill failed">{err}</p>}

      {progress && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>Progress:</strong> {progress.completionPercent}% ({progress.completedLessons}/{progress.totalLessons})
            </div>
            <div className="muted">Time spent: {fmtTime(progress.timeSpentSeconds || 0)}</div>
          </div>
          <div className="progress" style={{ marginTop: 10 }}>
            <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, progress.completionPercent || 0))}%` }} />
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Modules & Lessons</h2>
          {modules.length === 0 && <p className="muted">No lessons published for this course yet.</p>}

          {modules.map((m) => (
            <details key={m.id} open style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{m.title}</summary>
              {m.description && <div className="muted" style={{ margin: '6px 0 10px' }}>{m.description}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(m.lessons || []).map((l) => {
                  const status = l.progress?.status || 'NOT_STARTED'
                  return (
                    <div key={l.id} className="row" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => openLesson(l)}
                        style={{ textAlign: 'left' }}
                      >
                        <div style={{ fontWeight: 600 }}>{l.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {l.lessonType} • {status.replace('_', ' ')} • {Math.round((l.progress?.timeSpentSeconds || 0) / 60)} min
                        </div>
                      </button>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className={`status-pill ${status === 'COMPLETED' ? 'passed' : status === 'IN_PROGRESS' ? 'pending' : ''}`}>{status}</span>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy || status === 'COMPLETED'}
                          onClick={() => markComplete(l.id)}
                        >
                          Mark complete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          ))}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Lesson Viewer</h2>
          {!activeLesson && <p className="muted">Select a lesson to start.</p>}

          {activeLesson && (
            <>
              <h3 style={{ marginTop: 0 }}>{activeLesson.title}</h3>
              <div className="muted" style={{ marginBottom: 10 }}>
                Type: {activeLesson.lessonType} • Time spent: {Math.round((activeLesson.progress?.timeSpentSeconds || 0) / 60)} min
              </div>

              {activeLesson.lessonType === 'text' && (
                <div className="card" style={{ background: 'var(--panel)', padding: 12 }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{activeLesson.contentText || '—'}</pre>
                </div>
              )}

              {(activeLesson.lessonType === 'video' || activeLesson.lessonType === 'link') && (
                <div>
                  {activeLesson.contentUrl ? (
                    <>
                      <a className="btn-secondary" href={activeLesson.contentUrl} target="_blank" rel="noreferrer">Open link</a>
                      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{activeLesson.contentUrl}</div>
                    </>
                  ) : (
                    <p className="muted">No URL configured for this lesson.</p>
                  )}
                </div>
              )}

              {activeLesson.lessonType === 'pdf' && (
                <div>
                  {activeLesson.contentUrl ? (
                    <>
                      <a className="btn-secondary" href={activeLesson.contentUrl} target="_blank" rel="noreferrer">Open PDF</a>
                      <div style={{ height: 420, marginTop: 10 }}>
                        <iframe title="pdf" src={activeLesson.contentUrl} style={{ width: '100%', height: '100%', border: '1px solid var(--border)' }} />
                      </div>
                    </>
                  ) : (
                    <p className="muted">No PDF URL configured for this lesson.</p>
                  )}
                </div>
              )}

              {Array.isArray(activeLesson.resources) && activeLesson.resources.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <h4 style={{ marginBottom: 6 }}>Resources</h4>
                  <ul style={{ marginTop: 0 }}>
                    {activeLesson.resources.map((r) => (
                      <li key={r.id}>
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer">{r.title || r.url}</a>
                        ) : (
                          <a href={r.path} target="_blank" rel="noreferrer">{r.title || r.path}</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-primary" disabled={busy} onClick={() => markComplete(activeLesson.id)}>
                  Mark this lesson complete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }} className="muted">
        Tip: keep this page open while studying—time spent is tracked.
      </div>
    </div>
  )
}
