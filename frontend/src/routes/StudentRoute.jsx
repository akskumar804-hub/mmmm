import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function StudentRoute() {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>
    );
  }

  if (!user || user.role !== "student") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
