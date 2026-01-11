import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import Sidebar from "./Sidebar.jsx";

const adminNavItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/admin/courses", label: "Courses", icon: "📚" },
  { to: "/admin/analytics", label: "Analytics", icon: "📈" },
  { to: "/admin/students", label: "Students", icon: "🎓" },
  { to: "/admin/enrollments", label: "Enrollments", icon: "🧾" },
  { to: "/admin/results", label: "Exam Results", icon: "📝" },
  { to: "/admin/proctoring", label: "Proctoring", icon: "🛡️" },
  { to: "/admin/certificates", label: "Certificates", icon: "📜" },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const path = location.pathname;
  let pageTitle = "Dashboard";
  if (path.includes("/courses")) pageTitle = "Manage Courses";
  if (path.includes("/analytics")) pageTitle = "Analytics";
  if (path.includes("/students")) pageTitle = "Manage Students";
  if (path.includes("/enrollments")) pageTitle = "Enrollments";
  if (path.includes("/results")) pageTitle = "Exam Results";
  if (path.includes("/certificates")) pageTitle = "Certificates";

  return (
    <div className="app-layout">
      <Sidebar
        roleLabel="Admin"
        navItems={adminNavItems}
        user={user}
        loginPath="/login"
      />
      <main className="main-area">
        <header className="page-header">
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-subtitle">
              Administrator control center for the LMS.
            </p>
          </div>
        </header>
        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
