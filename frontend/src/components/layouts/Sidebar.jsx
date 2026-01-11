import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import logo from "../../assets/logo23.png";

export default function Sidebar({ roleLabel, navItems, user, loginPath }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate(loginPath);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img
          src={logo}
          alt="Montavales LMS Logo"
          className="sidebar-logo-mark"
        />
        <div>
          <div className="sidebar-logo-title">LMS</div>
          <div className="sidebar-logo-subtitle">
            Montavales Online Learning Portal
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              "sidebar-link" + (isActive ? " active" : "")
            }
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{user?.name?.[0] || "U"}</div>
          <div>
            <div className="sidebar-user-name">
              {user?.name || "Guest User"}
            </div>
            <div className="sidebar-user-meta">
              {roleLabel} · {user?.email || "Not signed in"}
            </div>
          </div>
        </div>
        <button className="sidebar-logout-button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}
