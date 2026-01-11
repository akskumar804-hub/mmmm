import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

// One login entry point for BOTH admin + student.
// - Login: single form (auto-detects role on backend (admin credentials are hard-coded via env))
// - Student can create account (link)
// - Forgot password is a LINK under the login form (not a button/tab)
export default function UnifiedLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const { login, registerStudent, requestPasswordReset, resetPassword } =
    useAuth();

  const resetTokenFromUrl = searchParams.get("resetToken") || "";

  const [mode, setMode] = useState(resetTokenFromUrl ? "reset" : "login"); // login | register | forgot | reset | verify

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);
  const [verificationCode, setVerificationCode] = useState("");
  const [isAdminVerify, setIsAdminVerify] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If the URL contains a reset token, always show reset screen.
    if (resetTokenFromUrl) {
      setMode("reset");
      setResetToken(resetTokenFromUrl);
    }
  }, [resetTokenFromUrl]);

  const goAfterLogin = (user) => {
    const stateTo = location.state?.from?.pathname;
    if (stateTo) {
      navigate(stateTo, { replace: true });
      return;
    }
    navigate(
      user?.role === "admin" ? "/admin/dashboard" : "/student/dashboard",
      { replace: true }
    );
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Call backend login endpoint to generate and send code
      const res = await fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:4000/api"
        }/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Login failed");
      }

      const data = await res.json();

      // Move to verification mode
      setIsAdminVerify(data.isAdmin);
      setMode("verify");
      setMessage(data.message); // "Code sent to your email" or "Use code: XXXXXX"
      setVerificationCode("");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await registerStudent(name, email, password);
      navigate("/student/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestPasswordReset(email);
      setMessage(
        "If that email exists, a reset link has been sent. (If SMTP is not set, it will appear in backend console.)"
      );
      setMode("login");
    } catch (err) {
      setError(err.message || "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await resetPassword(resetToken, newPassword);
      setMessage("Password updated. You can now login.");
      setMode("login");
      setNewPassword("");
      // Keep token in field only if user stays on reset screen; we are going back to login.
    } catch (err) {
      setError(err.message || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Call backend verify-code endpoint
      const res = await fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:4000/api"
        }/auth/verify-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: verificationCode }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Verification failed");
      }

      const data = await res.json();

      // Login with the token
      const u = await login(email, null, data.token, data.user);
      goAfterLogin(u || data.user);
    } catch (err) {
      setError(err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const renderLogin = () => (
    <>
      <form onSubmit={handleLogin} className="auth-form">
        <label>
          Email
          <br />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label>
          Password
          <br />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        {message && <p className="muted">{message}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <div className="auth-links">
          <a
            href="#"
            className="auth-link"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setMessage("");
              setMode("register");
            }}
          >
            Create account
          </a>
          <a
            href="#"
            className="auth-link"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setMessage("");
              setMode("forgot");
            }}
          >
            Forgot password?
          </a>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Result policy: auto-evaluated, visible after <strong>3 days</strong>.
          Retake cooldown starts <strong>after result release</strong>.
        </p>
      </form>
    </>
  );

  const renderVerify = () => (
    <>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Verify your code
      </h3>
      <p className="muted">
        {isAdminVerify
          ? "Admin verification code is displayed above."
          : "A verification code has been sent to your email."}
      </p>
      <form onSubmit={handleVerify} className="auth-form">
        <label>
          Verification Code
          <input
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
            placeholder="Enter 6-digit code"
            maxLength="6"
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        {message && <p className="muted">{message}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Verifying..." : "Verify & Login"}
        </button>

        <a
          href="#"
          className="auth-link"
          onClick={(e) => {
            e.preventDefault();
            setError("");
            setMessage("");
            setMode("login");
            setVerificationCode("");
          }}
        >
          Back to login
        </a>
      </form>
    </>
  );

  const renderRegister = () => (
    <>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Create your account
      </h3>
      <form onSubmit={handleRegister} className="auth-form">
        <label>
          Full name
          <br />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Email
          <br />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label>
          Password (min 6 chars)
          <br />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create account"}
        </button>

        <div className="auth-links" style={{ justifyContent: "flex-start" }}>
          <a
            href="#"
            className="auth-link"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setMessage("");
              setMode("login");
            }}
          >
            Back to login
          </a>
        </div>
      </form>
    </>
  );

  const renderForgot = () => (
    <>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Forgot password
      </h3>
      <form onSubmit={handleForgot} className="auth-form">
        <label>
          Email
          <br />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        {message && <p className="muted">{message}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending..." : "Send reset link"}
        </button>

        <div className="auth-links">
          <a
            href="#"
            className="auth-link"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setMessage("");
              setMode("login");
            }}
          >
            Back to login
          </a>
          <a
            href="#"
            className="auth-link"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setMessage("");
              setMode("reset");
            }}
            title="If you already have a token"
          >
            I have a token
          </a>
        </div>
      </form>
    </>
  );

  const renderReset = () => (
    <>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Reset password
      </h3>
      <form onSubmit={handleReset} className="auth-form">
        <label>
          Reset token
          <br />
          <input
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <br />
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        {message && <p className="muted">{message}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Updating..." : "Update password"}
        </button>

        <div className="auth-links" style={{ justifyContent: "flex-start" }}>
          <a
            href="#"
            className="auth-link"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setMode("login");
            }}
          >
            Back to login
          </a>
        </div>
      </form>
    </>
  );

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="brand-title">LMS Portal</h1>
        <p className="muted" style={{ marginTop: 0 }}></p>

        {mode === "login" && renderLogin()}
        {mode === "register" && renderRegister()}
        {mode === "forgot" && renderForgot()}
        {mode === "reset" && renderReset()}
        {mode === "verify" && renderVerify()}
      </div>

      <div className="auth-aside">
        <h2 className="section-title">Key LMS rules</h2>
        <ul className="muted" style={{ lineHeight: 1.7 }}>
          <li>
            <strong>Single course fee</strong>: Admission fee ₹3000 +
            course-wise tuition fee (paid once).
          </li>
          <li>
            <strong>Auto evaluation</strong>: Exam is auto evaluated, but result
            shows after <strong>3 days</strong>.
          </li>
          <li>
            <strong>Subject-wise retake</strong>: If you fail 1 subject, you
            retake only that subject (arrears style).
          </li>
          <li>
            <strong>Cooldown</strong>: Retake gap starts{" "}
            <strong>after result release</strong>.
          </li>
          <li>
            <strong>Verification</strong>: Public verify page shows completion
            details via Enrollment No + DOB.
          </li>
        </ul>
        <p className="muted" style={{ marginTop: 12 }}>
          Tip: configure backend email (SMTP) to enable automated emails;
          otherwise emails are logged in console.
        </p>

        <div style={{ marginTop: 14 }}>
          <a className="auth-link" href="/verify">
            Open public verification
          </a>
        </div>
      </div>
    </div>
  );
}
