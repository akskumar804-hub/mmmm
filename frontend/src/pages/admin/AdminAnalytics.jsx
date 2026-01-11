import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { apiRequest } from '../../api/http.js'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

function fmtTime(s = 0) {
  const m = Math.round(s / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h > 0) return `${h}h ${mm}m`
  return `${m}m`
}

async function downloadFile(url, token, filename) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(a.href)
  a.remove()
}

export default function AdminAnalytics() {
  const { token } = useAuth()
  const [summary, setSummary] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = async () => {
    const s = await apiRequest('/admin/analytics/summary', { token })
    const st = await apiRequest('/admin/analytics/students', { token })
    setSummary(s)
    setStudents(st.students || [])
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        await load()
      } catch (e) {
        if (!mounted) return
        setErr(e.message || 'Failed to load analytics')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [token])

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Admin Analytics</h1>
          <p className="page-subtitle">Completion %, time spent, recent exam activity, and exportable reports.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn-secondary" to="/admin/dashboard">Dashboard</Link>
          <Link className="btn-secondary" to="/admin/courses">Courses</Link>
        </div>
      </header>

      {loading && <p className="muted">Loading...</p>}
      {err && <p className="status-pill failed">{err}</p>}

      {summary && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 16 }}>
          <div className="card"><div className="muted">Students</div><div style={{ fontSize: 28, fontWeight: 800 }}>{summary.students}</div></div>
          <div className="card"><div className="muted">Enrollments</div><div style={{ fontSize: 28, fontWeight: 800 }}>{summary.enrollments}</div></div>
          <div className="card"><div className="muted">Active</div><div style={{ fontSize: 28, fontWeight: 800 }}>{summary.activeEnrollments}</div></div>
          <div className="card"><div className="muted">Completed</div><div style={{ fontSize: 28, fontWeight: 800 }}>{summary.completedEnrollments}</div></div>
          <div className="card"><div className="muted">Exam attempts</div><div style={{ fontSize: 28, fontWeight: 800 }}>{summary.examAttempts}</div></div>
          <div className="card"><div className="muted">Pending results</div><div style={{ fontSize: 28, fontWeight: 800 }}>{summary.pendingResults}</div></div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Exports</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => downloadFile('/admin/exports/enrollments.csv', token, 'enrollments.csv')}>Enrollments CSV</button>
          <button className="btn-secondary" onClick={() => downloadFile('/admin/exports/progress.csv', token, 'course_progress.csv')}>Progress CSV</button>
          <button className="btn-secondary" onClick={() => downloadFile('/admin/exports/exams.csv', token, 'exam_attempts.csv')}>Exams CSV</button>
          <button className="btn-secondary" onClick={() => downloadFile('/admin/exports/enrollments.json', token, 'enrollments.json')}>Enrollments JSON</button>
          <button className="btn-secondary" onClick={() => downloadFile('/admin/exports/progress.json', token, 'course_progress.json')}>Progress JSON</button>
          <button className="btn-secondary" onClick={() => downloadFile('/admin/exports/exams.json', token, 'exam_attempts.json')}>Exams JSON</button>
        </div>
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Tip: Use CSV in Excel/Google Sheets for reporting.</div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Students</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Enrollment</th>
                <th>Content progress</th>
                <th>Time spent</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={`${s.userId}-${s.courseId}`}>
                  <td>
                    <strong>{s.name || '—'}</strong>
                    <div className="muted">{s.email}</div>
                  </td>
                  <td>{s.courseTitle}</td>
                  <td><span className={`status-pill ${s.status === 'COMPLETED' ? 'passed' : s.status === 'PAID' || s.status === 'ACTIVE' ? 'pending' : ''}`}>{s.status}</span></td>
                  <td>{s.completionPercent}% ({s.completedLessons}/{s.totalLessons})</td>
                  <td>{fmtTime(s.timeSpentSeconds)}</td>
                  <td className="muted">{s.lastActivityAt || '—'}</td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr><td colSpan="6" className="muted">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
