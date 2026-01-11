import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import Sidebar from './Sidebar.jsx'

const studentNavItems = [
  { to: '/student/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/student/courses', label: 'Browse Courses', icon: '📚' },
  { to: '/student/my-courses', label: 'My Courses', icon: '🎓' },
  { to: '/student/exams', label: 'Exams', icon: '📝' },
  { to: '/student/certificates', label: 'Certificates', icon: '📜' },
  { to: '/student/profile', label: 'Profile', icon: '👤' }
]

export default function StudentLayout() {
  const { user } = useAuth()
  const location = useLocation()

  const path = location.pathname
  let pageTitle = 'Dashboard'
  if (path.includes('/courses/') && !path.endsWith('/courses')) pageTitle = 'Course Detail'
  else if (path.includes('/courses')) pageTitle = 'Browse Courses'
  if (path.includes('/my-courses')) pageTitle = 'My Courses'
  if (path.includes('/exams/')) pageTitle = 'Exam'
  else if (path.includes('/exams')) pageTitle = 'Exams'
  if (path.includes('/profile')) pageTitle = 'Profile'
  if (path.includes('/certificates')) pageTitle = 'Certificates'

  return (
    <div className="app-layout">
      <Sidebar
        roleLabel="Student"
        navItems={studentNavItems}
        user={user}
        loginPath="/login"
      />
      <main className="main-area">
        <header className="page-header">
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-subtitle">Welcome to your university learning dashboard.</p>
          </div>
        </header>
        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  )
}
