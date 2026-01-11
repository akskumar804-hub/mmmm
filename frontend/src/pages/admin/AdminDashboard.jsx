import React, { useEffect, useMemo, useState } from 'react'
import DashboardCard from '../../components/common/DashboardCard.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { apiRequest } from '../../api/http.js'

export default function AdminDashboard() {
  const { token } = useAuth()
  const [students, setStudents] = useState([])
  const [courses, setCourses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [results, setResults] = useState([])
  const [certificates, setCertificates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [s, c, e, r, cert] = await Promise.all([
          apiRequest('/admin/students', { token }),
          apiRequest('/admin/courses', { token }),
          apiRequest('/admin/enrollments', { token }),
          apiRequest('/admin/results', { token }),
          apiRequest('/admin/certificates', { token })
        ])
        if (!mounted) return
        setStudents(s.students || [])
        setCourses(c.courses || [])
        setEnrollments(e.enrollments || [])
        setResults(r.results || [])
        setCertificates(cert.certificates || [])
      } catch (e2) {
        if (!mounted) return
        setError(e2.message || 'Failed to load dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [token])

  const recentEnrollments = useMemo(() => {
    const list = [...enrollments]
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    return list.slice(0, 5)
  }, [enrollments])

  return (
    <>
      <div>
        <h2 className="section-title">Welcome, Admin</h2>
        <p className="section-helper">Approve profiles, confirm payments, monitor exams, and issue certificates.</p>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      {!loading && !error && (
        <>
          <div className="dashboard-grid">
            <DashboardCard title="Total students" value={students.length} helper="Registered student accounts." accent="🎓" />
            <DashboardCard title="Total courses" value={courses.length} helper="Courses available in catalog." accent="📚" />
            <DashboardCard title="Enrollments" value={enrollments.length} helper="All course enrollments." accent="🧾" />
            <DashboardCard title="Exam attempts" value={results.length} helper="Total submitted attempts." accent="📝" />
            <DashboardCard title="Certificates" value={certificates.length} helper="Issued certificates." accent="📜" />
          </div>

          <div className="card">
            <h3 className="section-title">Recent enrollments</h3>
            {recentEnrollments.length === 0 ? (
              <p className="muted">No enrollments yet.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Enrollment #</th>
                      <th>Course</th>
                      <th>Student</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEnrollments.map((en) => (
                      <tr key={en.id}>
                        <td>{en.enrollmentNo || en.id}</td>
                        <td>{en.courseTitle}</td>
                        <td>
                          <div><strong>{en.studentName || '—'}</strong></div>
                          <div className="muted">{en.studentEmail}</div>
                        </td>
                        <td><span className="status-pill pending">{en.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
