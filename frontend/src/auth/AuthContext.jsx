import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest } from "../api/http.js";

const AuthContext = createContext(null);

const LS_TOKEN = "lms_token";
const LS_USER = "lms_user";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    try {
      const t = window.localStorage.getItem(LS_TOKEN);
      const u = window.localStorage.getItem(LS_USER);
      if (t) setToken(t);
      if (u) setUser(JSON.parse(u));
    } catch {
      // ignore
    } finally {
      setBooting(false);
    }
  }, []);

  const persist = (t, u) => {
    setToken(t);
    setUser(u);
    window.localStorage.setItem(LS_TOKEN, t);
    window.localStorage.setItem(LS_USER, JSON.stringify(u));
  };
  // Single login endpoint for BOTH admin + student.
  // Admin credentials are hard-coded on the backend via ADMIN_EMAIL/ADMIN_PASSWORD (seeded).
  const login = async (email, password, token = null, user = null) => {
    // If token is provided directly (from code verification), use it
    if (token) {
      // Use provided user object or create minimal one
      const userData = user || { email };
      persist(token, userData);
      return userData;
    }
    // Otherwise do the old flow (password-based)
    const res = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    persist(res.token, res.user);
    return res.user;
  };

  // Optional helpers (not used by the unified UI).
  const loginStudent = async (email, password) => {
    const u = await login(email, password);
    if (u?.role !== "student") throw new Error("Not a student account");
    return u;
  };

  const loginAdmin = async (email, password) => {
    const u = await login(email, password);
    if (u?.role !== "admin") throw new Error("Not an admin account");
    return u;
  };

  const registerStudent = async (name, email, password) => {
    const res = await apiRequest("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    persist(res.token, res.user);
    return res.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(LS_TOKEN);
    window.localStorage.removeItem(LS_USER);
  };

  const requestPasswordReset = async (email) => {
    await apiRequest("/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
    return true;
  };

  const resetPassword = async (resetToken, newPassword) => {
    await apiRequest("/auth/reset-password", {
      method: "POST",
      body: { token: resetToken, newPassword },
    });
    return true;
  };

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      isAuthenticated: !!token && !!user,
      login,
      loginStudent,
      loginAdmin,
      registerStudent,
      logout,
      requestPasswordReset,
      resetPassword,
    }),
    [user, token, booting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
