import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function StudentLogin() {
  const { loginStudent } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('student@demo.com')
  const [password, setPassword] = useState('student123')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await loginStudent(email, password)
      setError('')
      navigate('/student/dashboard')
    } catch (err) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Student Portal</h1>
        <p className="auth-subtitle">Sign in to access your courses, exams, and certificates.</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="student-email">Email</label>
            <input
              id="student-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="student-password">Password</label>
            <input
              id="student-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '4px' }}>
            Sign in
          </button>
        </form>
        <div className="auth-demo-box">
          <div className="auth-demo-title">Demo credentials</div>
          <div className="auth-demo-row">
            <span>Email</span>
            <code>student@demo.com</code>
          </div>
          <div className="auth-demo-row">
            <span>Password</span>
            <code>student123</code>
          </div>
        </div>
      </div>
    </div>
  )
}
