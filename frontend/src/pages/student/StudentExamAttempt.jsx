import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/http.js";
import { useAuth } from "../../auth/AuthContext.jsx";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function getFingerprint() {
  const key = "lms_fp_v1";
  let v = localStorage.getItem(key);
  if (!v) {
    v = `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
      .toString(16)
      .slice(2)}`;
    localStorage.setItem(key, v);
  }
  return v;
}

function isFullscreen() {
  return !!document.fullscreenElement;
}

async function requestFullscreen() {
  const el = document.documentElement;
  if (el?.requestFullscreen) {
    try {
      await el.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export default function StudentExamAttempt() {
  const { subjectId, courseId } = useParams();
  const examId = courseId || subjectId; // Use courseId for new route, subjectId for old route
  const isCourseBased = !!courseId;
  const nav = useNavigate();
  const { token } = useAuth();

  const PROCTOR_MAX_WARNINGS = parseInt(
    import.meta.env.VITE_PROCTOR_MAX_WARNINGS || "3",
    10
  );
  const SNAPSHOT_INTERVAL_SEC = parseInt(
    import.meta.env.VITE_PROCTOR_SNAPSHOT_INTERVAL_SECONDS || "30",
    10
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(null);
  const [exam, setExam] = useState(null);

  const [activeSession, setActiveSession] = useState(null);

  const [mode, setMode] = useState(null); // Set by server based on exam config
  const [screenshareEnabled, setScreenshareEnabled] = useState(null); // Set by server based on exam config

  const [proctorActive, setProctorActive] = useState(false);
  const [proctorSessionId, setProctorSessionId] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // {qid: selectedIndex}
  const [activeIndex, setActiveIndex] = useState(0);

  const [warnings, setWarnings] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null); // seconds
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const webcamVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  const snapshotTimerRef = useRef(null);
  const tickRef = useRef(null);
  const heartbeatRef = useRef(null);
  const tabIdRef = useRef(
    `${Date.now()}_${Math.random().toString(16).slice(2)}`
  );

  const lockKey = useMemo(() => `lms_exam_lock_${examId}`, [examId]);

  const answeredCount = useMemo(
    () => Object.keys(answers || {}).length,
    [answers]
  );
  const totalQuestions = questions?.length || 0;

  function incWarning(reason) {
    setWarnings((w) => {
      const nw = w + 1;
      if (nw >= PROCTOR_MAX_WARNINGS) {
        autoSubmit("MAX_WARNINGS", { reason, warnings: nw });
      }
      return nw;
    });
  }

  async function logEvent(type, meta = {}) {
    if (!proctorSessionId) return;
    try {
      const endpoint = isCourseBased
        ? `/student/courses/${courseId}/exam/proctor/event`
        : `/student/exams/${subjectId}/proctor/event`;
      await apiRequest(endpoint, {
        token,
        method: "POST",
        body: { sessionId: proctorSessionId, type, meta },
      });
    } catch {
      // ignore
    }
  }

  async function uploadSnapshot(blob, snapshotType) {
    if (!proctorSessionId || !blob) return;
    const fd = new FormData();
    fd.append(
      "snapshot",
      blob,
      `${snapshotType.toLowerCase()}_${Date.now()}.jpg`
    );
    fd.append("sessionId", String(proctorSessionId));
    fd.append("snapshotType", snapshotType);
    try {
      const endpoint = isCourseBased
        ? `/student/courses/${courseId}/exam/proctor/snapshot`
        : `/student/exams/${subjectId}/proctor/snapshot`;
      await apiRequest(endpoint, {
        token,
        method: "POST",
        isForm: true,
        body: fd,
      });
    } catch {
      // ignore
    }
  }

  async function captureFromVideo(videoEl) {
    if (!videoEl) return null;
    const w = videoEl.videoWidth || 0;
    const h = videoEl.videoHeight || 0;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
  }

  async function startWebcamIfNeeded(modeRequired) {
    if (modeRequired !== "WEBCAM") return true;
    if (webcamStreamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) webcamVideoRef.current.srcObject = stream;
      await logEvent("WEBCAM_STARTED");
      return true;
    } catch (e) {
      await logEvent("WEBCAM_DENIED", { message: e?.message });
      return false;
    }
  }

  async function startScreenshareIfNeeded(screenshareRequired) {
    if (!screenshareRequired) return true;
    if (screenStreamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = stream;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;

      const track = stream.getVideoTracks?.()[0];
      if (track) {
        track.onended = () => {
          logEvent("SCREENSHARE_STOPPED");
          incWarning("Screen share stopped");
        };
      }

      await logEvent("SCREENSHARE_STARTED");
      return true;
    } catch (e) {
      await logEvent("SCREENSHARE_DENIED", { message: e?.message });
      incWarning("Screen share denied");
      return false;
    }
  }

  function stopStreams() {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
  }

  function clearTimers() {
    if (snapshotTimerRef.current) {
      clearInterval(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }

  async function beginSnapshotsLoop() {
    clearInterval(snapshotTimerRef.current);
    snapshotTimerRef.current = setInterval(async () => {
      try {
        if (mode === "WEBCAM" && webcamVideoRef.current) {
          const blob = await captureFromVideo(webcamVideoRef.current);
          if (blob) await uploadSnapshot(blob, "WEBCAM");
        }
        if (screenshareEnabled && screenVideoRef.current) {
          const blob = await captureFromVideo(screenVideoRef.current);
          if (blob) await uploadSnapshot(blob, "SCREEN");
        }
      } catch {
        // ignore
      }
    }, clamp(SNAPSHOT_INTERVAL_SEC, 10, 180) * 1000);
  }

  async function fetchPaper(sessionId) {
    try {
      const endpoint = isCourseBased
        ? `/student/courses/${courseId}/exam/proctor/paper?sessionId=${sessionId}`
        : `/student/exams/${subjectId}/proctor/paper?sessionId=${sessionId}`;
      const data = await apiRequest(endpoint, { token });
      const q = data?.paper?.questions || [];
      setQuestions(q);
      setActiveIndex(0);
      setAnswers({});
      const durationMinutes =
        data?.paper?.durationMinutes || exam?.durationMinutes || 10;
      setTimeLeft(Math.max(1, parseInt(durationMinutes, 10)) * 60);
    } catch (e) {
      throw new Error(
        `Failed to load exam paper: ${e.message || "Unknown error"}`
      );
    }
  }

  async function startProctoring({ resumeSessionId } = {}) {
    setError("");
    setSubmitted(null);

    // lock the exam to a single tab
    try {
      localStorage.setItem(lockKey, tabIdRef.current);
    } catch {
      // ignore
    }

    // Start (or resume) proctor session - get rules from server
    let sid = resumeSessionId || null;
    let proctorMode = mode;
    let proctorScreenshareEnabled = screenshareEnabled;

    if (!sid) {
      const endpoint = isCourseBased
        ? `/student/courses/${courseId}/exam/proctor/start`
        : `/student/exams/${subjectId}/proctor/start`;
      const data = await apiRequest(endpoint, {
        token,
        method: "POST",
        body: {
          clientInfo: {
            fingerprint: getFingerprint(),
            userAgent: navigator.userAgent,
            screen: { w: window.screen?.width, h: window.screen?.height },
            viewport: { w: window.innerWidth, h: window.innerHeight },
          },
        },
      });
      sid = data.sessionId;
      // Get mode and screenshare settings from server response
      proctorMode = data.mode;
      proctorScreenshareEnabled = data.screenshareEnabled;
      setMode(proctorMode);
      setScreenshareEnabled(proctorScreenshareEnabled);
    }

    // Start requested streams based on server-configured settings
    // Order: First ask for screen share (if enabled), then webcam, then enter fullscreen
    const screenOk = await startScreenshareIfNeeded(proctorScreenshareEnabled);
    if (proctorScreenshareEnabled && !screenOk) {
      setError(
        "Screen sharing is required for this exam. Please allow screen sharing and try again."
      );
      return;
    }

    const camOk = await startWebcamIfNeeded(proctorMode);
    if (proctorMode === "WEBCAM" && !camOk) {
      setError(
        "Webcam is required for this exam. Please allow webcam access and try again."
      );
      return;
    }

    // Enter fullscreen (best-effort) after media streams are ready
    if (!isFullscreen()) {
      const ok = await requestFullscreen();
      if (!ok) {
        await logEvent("FULLSCREEN_EXIT", { step: "enter_denied" });
        incWarning("Fullscreen not allowed");
      }
    }

    setProctorSessionId(sid);
    setProctorActive(true);
    setWarnings(0);
    await logEvent("START", {
      mode: proctorMode,
      screenshareEnabled: proctorScreenshareEnabled,
      resumed: !!resumeSessionId,
    });

    try {
      await fetchPaper(sid);
    } catch (e) {
      setProctorActive(false);
      setError(e.message || "Failed to load exam paper");
      return;
    }

    // Timer tick + heartbeat
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t == null) return t;
        const nt = t - 1;
        if (nt <= 0) {
          autoSubmit("TIME_UP");
          return 0;
        }
        return nt;
      });
    }, 1000);

    beginSnapshotsLoop();

    // Heartbeat
    setTimeout(() => logEvent("HEARTBEAT", { ts: Date.now() }), 5000);
    clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(
      () => logEvent("HEARTBEAT", { ts: Date.now() }),
      30000
    );
  }

  async function submitAttempt({ auto = false, reason = null } = {}) {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (auto) await logEvent("AUTO_SUBMIT", { reason });
      const endpoint = isCourseBased
        ? `/student/courses/${courseId}/exam/attempt`
        : `/student/exams/${subjectId}/attempt`;
      const data = await apiRequest(endpoint, {
        token,
        method: "POST",
        body: { answers, proctorSessionId },
      });
      setSubmitted(data.attempt || data);
      clearTimers();
      stopStreams();

      // Exit fullscreen after exam completion
      if (isFullscreen() && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore if fullscreen exit fails
        }
      }

      try {
        // release tab lock
        if (localStorage.getItem(lockKey) === tabIdRef.current)
          localStorage.removeItem(lockKey);
      } catch {}
    } catch (e) {
      setError(e.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  function autoSubmit(reason, meta = {}) {
    if (submitting || submitted) return;
    logEvent("AUTO_SUBMIT", { reason, ...meta });
    submitAttempt({ auto: true, reason });
  }

  // Load exam meta + active session
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError("");

        // For subject-based exams, load subject and exam details
        if (!isCourseBased) {
          const data = await apiRequest(`/student/exams/${subjectId}`, {
            token,
          });
          const act = await apiRequest(
            `/student/exams/${subjectId}/proctor/active`,
            { token }
          );
          if (!mounted) return;
          setSubject(data.subject);
          setExam(data.exam);
          setActiveSession(act.active || null);
        } else {
          // For course-based exams, load exam details
          const data = await apiRequest(`/student/courses/${courseId}/exam`, {
            token,
          });
          if (!mounted) return;
          setExam(data.exam);
          setActiveSession(null);
        }
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load exam");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token, subjectId, courseId, isCourseBased]);

  // Proctoring event listeners (only when active)
  useEffect(() => {
    if (!proctorActive) return;

    const onVis = () => {
      if (document.hidden) {
        logEvent("TAB_HIDDEN");
        incWarning("Tab hidden");
      }
    };
    const onBlur = () => {
      logEvent("WINDOW_BLUR");
      incWarning("Window blurred");
    };
    const onFs = () => {
      if (!isFullscreen()) {
        logEvent("FULLSCREEN_EXIT");
        incWarning("Exited fullscreen");
      }
    };
    const onCtx = (e) => {
      e.preventDefault();
      logEvent("RIGHT_CLICK");
      incWarning("Right-click blocked");
    };
    const onCopy = () => {
      logEvent("COPY_ATTEMPT");
      incWarning("Copy attempt");
    };
    const onPaste = () => {
      logEvent("PASTE_ATTEMPT");
      incWarning("Paste attempt");
    };
    const onResize = () => {
      logEvent("RESIZE", { w: window.innerWidth, h: window.innerHeight });
    };
    const onOffline = () => {
      logEvent("NETWORK_OFFLINE");
    };
    const onOnline = () => {
      logEvent("NETWORK_ONLINE");
    };
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      const isF12 = e.key === "F12";
      const isPrint = e.key === "PrintScreen" || e.keyCode === 44;
      const combo =
        (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k)) ||
        (e.ctrlKey && ["u", "s", "p", "c", "v", "x"].includes(k)) ||
        (e.metaKey && ["c", "v", "x"].includes(k));
      if (isF12 || combo) {
        logEvent("KEY_COMBO", {
          key: e.key,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          meta: e.metaKey,
        });
        incWarning("Suspicious key combo");
        e.preventDefault();
      }
      if (isPrint) {
        logEvent("PRINTSCREEN");
        incWarning("PrintScreen detected");
      }
    };

    // Multi-tab lock detector
    const onStorage = (e) => {
      if (e.key !== lockKey) return;
      const v = localStorage.getItem(lockKey);
      if (v && v !== tabIdRef.current) {
        logEvent("MULTI_TAB", { other: v });
        incWarning("Multiple exam tabs detected");
      }
    };

    // DevTools heuristic: if viewport shrinks suddenly (best-effort)
    const devtoolsTimer = setInterval(() => {
      const w = window.outerWidth - window.innerWidth;
      const h = window.outerHeight - window.innerHeight;
      if (w > 200 || h > 200) {
        logEvent("DEVTOOLS_SUSPECTED", { w, h });
      }
    }, 4000);

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    window.addEventListener("resize", onResize);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("keydown", onKey);
    window.addEventListener("storage", onStorage);
    const onBeforeUnload = (e) => {
      try {
        logEvent("NAV_AWAY", { type: "beforeunload" });
      } catch {}
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearInterval(devtoolsTimer);
    };
  }, [proctorActive, proctorSessionId, lockKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      stopStreams();
      try {
        if (localStorage.getItem(lockKey) === tabIdRef.current)
          localStorage.removeItem(lockKey);
      } catch {}
    };
  }, []);

  const currentQ = questions?.[activeIndex] || null;

  if (loading) return <div className="muted">Loading exam...</div>;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>{subject?.subjectName || "Exam"}</h2>
          <div className="muted">
            {exam?.title ? (
              <span>
                <strong>{exam.title}</strong> •{" "}
              </span>
            ) : null}
            Duration: {exam?.durationMinutes || "-"} min • Questions:{" "}
            {exam?.questionCount ?? "-"}
          </div>
        </div>
        <button className="btn" onClick={() => nav("/student/dashboard")}>
          Back
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {submitted && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Submitted</h3>
          <div className="muted">
            Result will be visible after 3 days. (Release:{" "}
            {submitted.resultReleaseAt})
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span className="badge">Attempt #{submitted.attemptNo}</span>
          </div>
        </div>
      )}

      {!submitted && !proctorActive && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Start Exam (Single Login)</h3>

          {activeSession && (
            <div className="alert" style={{ marginBottom: 12 }}>
              Active session found: #{activeSession.sessionId} (started{" "}
              {activeSession.startedAt}). You can resume.
            </div>
          )}

          {exam?.proctorRequired && (
            <div className="alert" style={{ marginBottom: 12 }}>
              <strong>Proctoring Required:</strong> Your instructor requires
              proctoring for this exam.
              {exam.proctorMode === "WEBCAM" && (
                <>
                  {" "}
                  Webcam will be required.
                  {exam.proctorScreenshareRequired &&
                    " Screen sharing is also required."}
                </>
              )}
            </div>
          )}

          <div className="muted" style={{ marginTop: 10 }}>
            Rules: Fullscreen required • No tab switch • No copy/paste • No
            right-click • Multiple tabs will auto-submit after warnings.
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {activeSession ? (
              <button
                className="btn"
                onClick={() =>
                  startProctoring({ resumeSessionId: activeSession.sessionId })
                }
              >
                Resume Session
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              onClick={() => startProctoring()}
              disabled={submitting}
            >
              Start Exam
            </button>
          </div>
        </div>
      )}

      {!submitted && proctorActive && (
        <div style={{ marginTop: 12 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span className="badge">Session #{proctorSessionId}</span>
                <span className="badge">
                  Warnings: {warnings}/{PROCTOR_MAX_WARNINGS}
                </span>
                <span className="badge">
                  Time: {timeLeft == null ? "—" : fmtTime(timeLeft)}
                </span>
                <span className="badge">
                  {isFullscreen() ? "Fullscreen" : "Not Fullscreen"}
                </span>
                {mode === "WEBCAM" ? (
                  <span className="badge">Webcam</span>
                ) : null}
                {screenshareEnabled ? (
                  <span className="badge">Screen</span>
                ) : null}
              </div>
              <button
                className="btn"
                onClick={() => submitAttempt()}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>

            {(mode === "WEBCAM" || screenshareEnabled) && (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 10,
                }}
              >
                {mode === "WEBCAM" && (
                  <div className="card" style={{ padding: 10 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Webcam preview
                    </div>
                    <video
                      ref={webcamVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: "100%", borderRadius: 10 }}
                    />
                  </div>
                )}
                {screenshareEnabled && (
                  <div className="card" style={{ padding: 10 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Screen preview
                    </div>
                    <video
                      ref={screenVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: "100%", borderRadius: 10 }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>
                  Question {activeIndex + 1} / {totalQuestions}
                </h3>
                <div className="muted">
                  Answered: {answeredCount} / {totalQuestions}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={() =>
                    setActiveIndex((i) => clamp(i - 1, 0, totalQuestions - 1))
                  }
                  disabled={activeIndex === 0}
                >
                  Prev
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setActiveIndex((i) => clamp(i + 1, 0, totalQuestions - 1))
                  }
                  disabled={activeIndex === totalQuestions - 1}
                >
                  Next
                </button>
              </div>
            </div>

            {currentQ ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>
                  {currentQ.text}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {(currentQ.options || []).map((opt, idx) => (
                    <label
                      key={idx}
                      className="card"
                      style={{ padding: 10, cursor: "pointer" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQ.id}`}
                          checked={answers[currentQ.id] === idx}
                          onChange={() =>
                            setAnswers((a) => ({ ...a, [currentQ.id]: idx }))
                          }
                        />
                        <div>{opt}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 12 }}>
                Loading questions...
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ marginBottom: 8 }}>
                Jump to:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {questions.map((q, i) => (
                  <button
                    key={q.id || i}
                    className={
                      "btn btn-sm " + (i === activeIndex ? "btn-primary" : "")
                    }
                    onClick={() => setActiveIndex(i)}
                    title={answers[q.id] != null ? "Answered" : "Not answered"}
                  >
                    {i + 1}
                    {answers[q.id] != null ? "✓" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div className="muted" style={{ maxWidth: 620 }}>
                Proctoring is active. Any suspicious activity will be logged and
                may auto-submit after warnings.
              </div>
              <button
                className="btn btn-primary"
                onClick={() => submitAttempt()}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
