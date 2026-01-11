import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import DashboardCard from '../../components/common/DashboardCard.jsx'
import { apiRequest } from '../../api/http.js'

export default function StudentDashboard() {
  const { user, token } = useAuth()
  const [enrollments, setEnrollments] = useState([])
  const [subjects, setSubjects] = useState([])
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progressByCourse, setProgressByCourse] = useState({})
  const [progressLoading, setProgressLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const enr = await apiRequest('/student/enrollments', { token })
        const ex = await apiRequest('/student/exams', { token })
        if (!mounted) return
        setEnrollments(enr.enrollments || [])
        setSubjects(ex.subjects || [])
        setRules(ex.rules || null)
      } catch (e) {
        if (!mounted) return
        setError(e.message || 'Failed to load dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [token])

  // Load course progress for the dashboard (used for the home progress bar)
  useEffect(() => {
    let mounted = true
    if (!token) return () => {}
    ;(async () => {
      try {
        setProgressLoading(true)
        const active = (enrollments || []).filter((e) => ['PAID', 'ACTIVE', 'COMPLETED'].includes(e.status))
        const pairs = await Promise.all(
          active.map(async (e) => {
            try {
              const pr = await apiRequest(`/student/courses/${e.courseId}/progress`, { token })
              return [e.courseId, pr.courseProgress]
            } catch {
              return [e.courseId, null]
            }
          })
        )
        if (!mounted) return
        setProgressByCourse(Object.fromEntries(pairs))
      } finally {
        if (mounted) setProgressLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [token, enrollments])


  const summary = useMemo(() => {
    const total = enrollments.length
    const paid = enrollments.filter((e) => ['PAID', 'ACTIVE', 'COMPLETED'].includes(e.status)).length
    const pending = total - paid

    const nextEligible = subjects.find((s) => s.eligible)
    const pendingResults = subjects.filter((s) => s.latestAttempt && !s.latestAttempt.resultVisible).length

    return { total, paid, pending, nextEligible, pendingResults }
  }, [enrollments, subjects])

  const overallProgress = useMemo(() => {
    const active = (enrollments || []).filter((e) => ['PAID', 'ACTIVE', 'COMPLETED'].includes(e.status))
    let totalLessons = 0
    let completedLessons = 0
    let timeSpentSeconds = 0
    active.forEach((e) => {
      const pr = progressByCourse[e.courseId]
      if (!pr) return
      if (typeof pr.totalLessons === 'number' && pr.totalLessons > 0) {
        totalLessons += pr.totalLessons
        completedLessons += pr.completedLessons || 0
        timeSpentSeconds += pr.timeSpentSeconds || 0
      }
    })
    const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : null
    return { pct, totalLessons, completedLessons, timeSpentSeconds, activeCount: active.length }
  }, [enrollments, progressByCourse])

  if (!user) return null

  return (
    <>
      <div>
        <h2 className="section-title">Welcome, {user?.name || 'Student'}</h2>
        <p className="section-helper">
          Single payment per course (Admission ₹3000 + course-wise tuition). Exam results are released after {rules?.resultReleaseDays ?? 3} days.
        </p>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && !error && (
        <>
          <div className="dashboard-grid">
            <DashboardCard
              title="My enrollments"
              value={summary.total}
              helper={summary.pending > 0 ? `${summary.pending} pending action(s)` : 'All set'}
              accent="🎓"
            />
            <DashboardCard
              title="Paid / active"
              value={summary.paid}
              helper="Courses with payment confirmed."
              accent="💳"
            />
            <DashboardCard
              title="Pending results"
              value={summary.pendingResults}
              helper="Attempts submitted but result not yet released."
              accent="⏳"
            />
          
            <DashboardCard
              title="Overall progress"
              value={
                overallProgress.pct === null ? (
                  <span className="muted">—</span>
                ) : (
                  <div>
                    <div className="progress-row">
                      <span className="progress-percent">{overallProgress.pct}%</span>
                      <span className="muted">{Math.round((overallProgress.timeSpentSeconds || 0) / 60)} min</span>
                    </div>
                    <div className="progressbar" aria-label="Overall course progress">
                      <div className="progressbar-fill" style={{ width: `${overallProgress.pct}%` }} />
                    </div>
                  </div>
                )
              }
              helper={
                overallProgress.pct === null
                  ? (overallProgress.activeCount > 0 ? 'Open a course to start learning.' : 'No active courses yet.')
                  : `${overallProgress.completedLessons}/${overallProgress.totalLessons} lessons completed`
              }
              accent={progressLoading ? '⏳' : '📈'}
            />
</div>

          <div className="card">
            <h3 className="section-title">Next step</h3>
            <p className="section-helper">
              {summary.nextEligible
                ? `You can attempt ${summary.nextEligible.subjectName} (${summary.nextEligible.courseTitle}) now.`
                : 'No eligible exam right now (cooldown or not enrolled yet).'}
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <Link className="btn-primary" to="/student/my-courses">My Courses</Link>
              <Link className="btn-secondary" to="/student/exams">Go to Exams</Link>
              <Link className="btn-secondary" to="/student/profile">Update Profile / Upload Docs</Link>
            </div>

            <p className="muted" style={{ marginTop: 12 }}>
              Retake cooldown: <strong>{rules?.retakeGapDays ?? 3} days</strong> after result release.
            </p>
          </div>
        </>
      )}
    </>
  )
}
