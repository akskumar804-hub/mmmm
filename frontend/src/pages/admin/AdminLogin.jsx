import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function AdminLogin() {
  const { loginAdmin } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await loginAdmin(email, password)
      setError('')
      navigate('/admin/dashboard')
    } catch (err) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Admin Portal</h1>
        <p className="auth-subtitle">Sign in to manage courses, students, and results.</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
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
            <code>admin@demo.com</code>
          </div>
          <div className="auth-demo-row">
            <span>Password</span>
            <code>admin123</code>
          </div>
        </div>
      </div>
    </div>
  )
}
