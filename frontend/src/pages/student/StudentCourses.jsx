import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { apiRequest } from '../../api/http.js'

export default function StudentCourses() {
  const { token } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await apiRequest('/courses')
        if (!mounted) return
        setCourses(res.courses || [])
      } catch (e) {
        if (!mounted) return
        setError(e.message || 'Failed to load courses')
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
          <h1 className="page-title">Available Courses</h1>
          <p className="page-subtitle">Admission fee ₹3000 + course-wise tuition fee (paid once).</p>
        </div>
      </header>

      {loading && <p className="muted">Loading courses...</p>}
      {error && <p className="status-pill failed">{error}</p>}

      <div className="cards-grid">
        {courses.map((course) => (
          <div className="card" key={course.id}>
            <div className="card-header">
              <h3 className="card-title">{course.title}</h3>
              <span className="pill">{course.level || 'Course'}</span>
            </div>

            <p className="card-description">{course.shortDescription || course.short_description}</p>

            <div className="card-meta">
              <p>
                <span className="muted">Duration:</span> {course.duration || '-'}
              </p>
              <p>
                <span className="muted">Admission:</span> ₹{course.admissionFee ?? 3000}
              </p>
              <p>
                <span className="muted">Tuition:</span> ₹{course.tuitionFee}
              </p>
            </div>

            <Link className="btn-primary" to={`/student/courses/${course.id}`}>
              View details
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
