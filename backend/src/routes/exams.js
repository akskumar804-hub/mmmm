const express = require('express');
const dayjs = require('dayjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowIso, addDaysIso, randomCertificateNo } = require('../utils/helpers');
const { sendEmail } = require('../utils/mailer');
const { isCourseContentCompleted } = require('../utils/progress');

const router = express.Router();

const RESULT_RELEASE_DAYS = parseInt(process.env.RESULT_RELEASE_DAYS || '3', 10);
// Retake cooldown starts after result release. Default = 3 days (can override via env).
const RETAKE_GAP_DAYS = parseInt(process.env.RETAKE_GAP_DAYS || '3', 10);

// Proctoring uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads');
const PROCTOR_DIR = path.join(UPLOAD_DIR, 'proctor');
const PROCTOR_TMP_DIR = path.join(PROCTOR_DIR, 'tmp');

try {
  fs.mkdirSync(PROCTOR_TMP_DIR, { recursive: true });
} catch {}

const proctorUpload = multer({
  dest: PROCTOR_TMP_DIR,
  limits: { fileSize: parseInt(process.env.PROCTOR_SNAPSHOT_MAX_BYTES || '2000000', 10) }
});

const ALL_EVENT_TYPES = new Set([
  'START',
  'HEARTBEAT',
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
  'RIGHT_CLICK',
  'NAV_AWAY',
  'DEVTOOLS_SUSPECTED',
  'KEY_COMBO',
  'PRINTSCREEN',
  'RESIZE',
  'MULTI_TAB',
  'NETWORK_OFFLINE',
  'NETWORK_ONLINE',
  'SCREENSHARE_DENIED',
  'SCREENSHARE_STOPPED',
  'SCREENSHARE_STARTED',
  'WEBCAM_STARTED',
  'WEBCAM_DENIED',
  'AUTO_SUBMIT',
]);

const VIOLATION_EVENT_TYPES = new Set([
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
  'RIGHT_CLICK',
  'NAV_AWAY',
  'DEVTOOLS_SUSPECTED',
  'KEY_COMBO',
  'PRINTSCREEN',
  'MULTI_TAB',
  'SCREENSHARE_DENIED',
  'SCREENSHARE_STOPPED',
]);

function safeParseJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}

function safeParseJsonArray(val) {
  if (!val) return [];
  if (typeof val === 'object' && Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

function safeJson(obj) {
  try { return JSON.stringify(obj ?? null); } catch { return null; }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

// Helper: check if student has PAID/ACTIVE/COMPLETED enrollment for course
async function ensureEligible(db, userId, courseId) {
  const enr = await db.get(
    `SELECT status FROM enrollments WHERE user_id=? AND course_id=?`,
    [userId, courseId]
  );
  if (!enr) return { ok: false, reason: 'You are not enrolled in this course.' };
  if (!['PAID', 'ACTIVE', 'COMPLETED'].includes(enr.status)) {
    return { ok: false, reason: `Course is not activated yet (status: ${enr.status}). Complete profile + payment first.` };
  }

  // Course learning content must be completed before attempting exams.
  const completedContent = await isCourseContentCompleted(db, userId, courseId);
  if (!completedContent) {
    return { ok: false, reason: 'Complete all course lessons (learning content) to unlock exams.' };
  }
  return { ok: true };
}

// Check subject-level exam eligibility including retake cooldown
async function checkSubjectExamEligibility(db, userId, subjectId) {
  const latest = await db.get(
    `SELECT attempt_no AS "attemptNo", passed, result_release_at AS "resultReleaseAt"
     FROM exam_attempts WHERE user_id=? AND subject_id=? ORDER BY attempt_no DESC LIMIT 1`,
    [userId, subjectId]
  );

  if (!latest) {
    // No previous attempts, eligible to attempt
    return { ok: true, reason: null, nextAllowedAt: null };
  }

  if (latest.passed) {
    // Already passed, cannot retake
    return { ok: false, reason: 'You already passed this subject. Retake not allowed.' };
  }

  // Failed - check cooldown
  if (latest.resultReleaseAt) {
    const release = dayjs(latest.resultReleaseAt);
    const nextAllowedAt = release.add(RETAKE_GAP_DAYS, 'day');
    if (dayjs().isBefore(nextAllowedAt)) {
      return {
        ok: false,
        reason: `Retake cooldown active. You can retake after ${nextAllowedAt.format('YYYY-MM-DD HH:mm')}.`,
        nextAllowedAt: nextAllowedAt.toISOString()
      };
    }
  }

  return { ok: true, reason: null, nextAllowedAt: null };
}

// Student: list exams for enrolled courses
router.get('/student/exams', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const db = await getDb();
    
    // Get all exams for courses the student is enrolled in
    const exams = await db.all(
      `SELECT e.id AS "examId", e.title, e.duration_minutes AS "durationMinutes",
              e.exam_type AS "examType", e.course_id AS "courseId",
              c.title AS "courseTitle"
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       JOIN enrollments en ON en.course_id = c.id
       WHERE en.user_id = ? AND en.status IN ('PAID', 'ACTIVE', 'COMPLETED')
       ORDER BY c.id DESC, e.id ASC`,
      [req.user.id]
    );

    // Attach eligibility + latest attempt
    const out = [];
    for (const e of exams) {
      try {
        const courseElig = await ensureEligible(db, req.user.id, e.courseId);
        
        const latest = await db.get(
          `SELECT id, attempt_no AS "attemptNo", score_percent AS "scorePercent", passed, submitted_at AS "submittedAt",
                  result_release_at AS "resultReleaseAt"
           FROM exam_attempts
           WHERE user_id=? AND course_id=?
           ORDER BY attempt_no DESC LIMIT 1`,
          [req.user.id, e.courseId]
        );

        const now = dayjs();
        const visible = latest?.resultReleaseAt ? now.isAfter(dayjs(latest.resultReleaseAt)) : false;

        // For course-level exams, check if student passed and cooldown
        let eligible = courseElig.ok && (!latest || !latest.passed);
        let eligibilityReason = '';
        
        if (!courseElig.ok) {
          eligibilityReason = courseElig.reason;
          eligible = false;
        } else if (latest?.passed) {
          eligibilityReason = 'You have already passed this exam';
          eligible = false;
        } else if (latest && !latest.passed && latest.resultReleaseAt) {
          // Failed - check cooldown
          const release = dayjs(latest.resultReleaseAt);
          const nextAllowedAt = release.add(RETAKE_GAP_DAYS, 'day');
          if (now.isBefore(nextAllowedAt)) {
            eligibilityReason = `Retake cooldown active. You can retake after ${nextAllowedAt.format('YYYY-MM-DD HH:mm')}.`;
            eligible = false;
          }
        }

        out.push({
          ...e,
          eligible,
          eligibilityReason,
          latestAttempt: latest
            ? {
                ...latest,
                passed: !!latest.passed,
                resultVisible: visible
              }
            : null
        });
      } catch (err) {
        console.error(`Error processing exam ${e.examId}:`, err.message);
        out.push({
          ...e,
          eligible: false,
          eligibilityReason: 'Error loading exam',
          latestAttempt: null
        });
      }
    }

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json({ exams: out, rules: { resultReleaseDays: RESULT_RELEASE_DAYS, retakeGapDays: RETAKE_GAP_DAYS } });
  } catch (err) {
    console.error('Error fetching student exams:', err.message);
    return res.status(500).json({ error: 'Failed to load exams', details: err.message });
  }
});

// Student: get exam questions for subject
router.get('/student/exams/:subjectId', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const subject = await db.get(
    `SELECT s.id AS "subjectId", s.name AS "subjectName", s.passing_score AS "passingScore",
            c.id AS "courseId", c.title AS "courseTitle"
     FROM subjects s JOIN courses c ON c.id=s.course_id
     WHERE s.id=?`,
    [req.params.subjectId]
  );
  if (!subject) return res.status(404).json({ error: 'Subject not found' });

  const elig = await ensureEligible(db, req.user.id, subject.courseId);
  if (!elig.ok) return res.status(403).json({ error: elig.reason });

  const exam = await db.get(
    `SELECT id AS "examId", title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson"
     FROM exams WHERE subject_id=?`,
    [req.params.subjectId]
  );
  if (!exam) return res.status(404).json({ error: 'Exam not configured for this subject yet' });

  const questionCount = (() => {
    try { return safeParseJsonArray(exam.questionsJson).length; } catch { return 0; }
  })();

  // Important: questions are NOT returned here. They are provided only after proctoring starts via /proctor/paper.
  return res.json({ subject, exam: { examId: exam.examId, title: exam.title, durationMinutes: exam.durationMinutes, questionCount } });
});

// Student: get exam details for a COURSE (NEW - course-based)
router.get('/student/courses/:courseId/exam', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const courseId = parseInt(req.params.courseId, 10);
  
  const course = await db.get(
    `SELECT id, title FROM courses WHERE id=?`,
    [courseId]
  );
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const elig = await ensureEligible(db, req.user.id, courseId);
  if (!elig.ok) return res.status(403).json({ error: elig.reason });

  const exam = await db.get(
    `SELECT id AS "examId", title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson"
     FROM exams WHERE course_id=?`,
    [courseId]
  );
  if (!exam) return res.status(404).json({ error: 'Exam not configured for this course yet' });

  const questionCount = (() => {
    try { return safeParseJsonArray(exam.questionsJson).length; } catch { return 0; }
  })();

  // Important: questions are NOT returned here. They are provided only after proctoring starts via /proctor/paper.
  return res.json({ course, exam: { examId: exam.examId, title: exam.title, durationMinutes: exam.durationMinutes, questionCount } });
});

// Student: latest attempt status (with visibility)
router.get('/student/exams/:subjectId/latest', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const latest = await db.get(
    `SELECT id, attempt_no AS "attemptNo", score_percent AS "scorePercent", passed, submitted_at AS "submittedAt",
            result_release_at AS "resultReleaseAt"
     FROM exam_attempts
     WHERE user_id=? AND subject_id=?
     ORDER BY attempt_no DESC LIMIT 1`,
    [req.user.id, req.params.subjectId]
  );
  if (!latest) return res.json({ latest: null });

  const now = dayjs();
  const visible = latest.resultReleaseAt ? now.isAfter(dayjs(latest.resultReleaseAt)) : false;

  return res.json({ latest: { ...latest, passed: !!latest.passed, resultVisible: visible } });
});

// Student: submit attempt

// Start a proctoring session for a COURSE-BASED exam
router.post('/student/courses/:courseId/exam/proctor/start', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const courseId = parseInt(req.params.courseId, 10);

  // Must be eligible to attempt (course completed + enrolled)
  const elig = await ensureEligible(db, req.user.id, courseId);
  if (!elig.ok) return res.status(400).json({ error: elig.reason });

  // Get exam with proctoring settings (course-based)
  const exam = await db.get(
    `SELECT id, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
            proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
            proctor_screenshare_required AS "proctorScreenshareRequired"
     FROM exams WHERE course_id=?`,
    [courseId]
  );
  if (!exam) return res.status(404).json({ error: 'Exam not configured' });

  // Use admin-configured proctoring settings
  const mode = exam.proctorMode || 'BASIC';
  const screenshareEnabled = exam.proctorScreenshareRequired ? true : false;

  // Close any previous active session for this course (prevents multi-sessions)
  const tsNow = nowIso();
  await db.run(
    `UPDATE exam_proctor_sessions SET status='ENDED', ended_at=?, last_event_at=? 
     WHERE user_id=? AND course_id=? AND status='ACTIVE'`,
    [tsNow, tsNow, req.user.id, courseId]
  );

  // Build a randomized paper for this session
  const full = safeParseJsonArray(exam.questionsJson);
  const perAttempt = parseInt(process.env.EXAM_QUESTIONS_PER_ATTEMPT || '0', 10);
  const seedInt = Math.floor(Math.random() * 2 ** 31);
  const rng = mulberry32(seedInt);

  const normalized = full.map((q, idx) => ({
    id: q.id ?? idx + 1,
    text: q.text ?? q.question ?? '',
    options: Array.isArray(q.options) ? q.options : [],
    correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : (typeof q.correct_index === 'number' ? q.correct_index : 0)
  }));

  let picked = normalized;
  if (perAttempt > 0 && perAttempt < normalized.length) {
    picked = seededShuffle(normalized, rng).slice(0, perAttempt);
  }

  // Shuffle question order
  const paperQ = seededShuffle(picked, rng).map((q) => {
    const idxs = q.options.map((_, i) => i);
    const shuffledIdxs = seededShuffle(idxs, rng);
    const newOptions = shuffledIdxs.map((i) => q.options[i]);
    const newCorrect = shuffledIdxs.indexOf(q.correctIndex);
    return { id: q.id, text: q.text, options: newOptions, correctIndex: Math.max(0, newCorrect) };
  });

  const paperJson = safeJson({ seed: seedInt, durationMinutes: exam.durationMinutes, questions: paperQ });
  const paperHash = sha256(paperJson);

  const startedAt = nowIso();
  const clientInfo = safeJson(req.body?.clientInfo);
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null;
  const ua = req.headers['user-agent'] || null;
  const fingerprint = req.body?.clientInfo?.fingerprint || null;

  const ins = await db.run(
    `INSERT INTO exam_proctor_sessions
      (user_id, subject_id, course_id, started_at, status, mode, warning_count, events_count, snapshots_count, last_event_at, client_info,
       ip_address, user_agent, fingerprint, paper_json, paper_hash, screenshare_enabled)
     VALUES (?, NULL, ?, ?, 'ACTIVE', ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, courseId, startedAt, mode, startedAt, clientInfo, ip, ua, fingerprint, paperJson, paperHash, screenshareEnabled]
  );

  console.log(`✅ Created proctor session: id=${ins.lastID}, userId=${req.user.id}, courseId=${courseId}`);
  return res.json({ sessionId: ins.lastID, startedAt, mode, screenshareEnabled });
});

// Start a proctoring session for an exam attempt
router.post('/student/exams/:subjectId/proctor/start', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const subjectId = parseInt(req.params.subjectId, 10);

  // Must be eligible to attempt (course completed + enrolled + cooldown ok)
  const subj = await db.get(`SELECT s.id AS "subjectId", s.course_id AS "courseId" FROM subjects s WHERE s.id=?`, [subjectId]);
  if (!subj) return res.status(404).json({ error: 'Subject not found' });
  const elig = await ensureEligible(db, req.user.id, subj.courseId);
  if (!elig.ok) return res.status(400).json({ error: elig.reason, nextAllowedAt: elig.nextAllowedAt });

  // Get exam with proctoring settings
  const exam = await db.get(
    `SELECT id, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
            proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
            proctor_screenshare_required AS "proctorScreenshareRequired"
     FROM exams WHERE subject_id=?`,
    [subjectId]
  );
  if (!exam) return res.status(404).json({ error: 'Exam not configured' });

  // Use admin-configured proctoring settings, not student choice
  const mode = exam.proctorMode || 'BASIC';
  const screenshareEnabled = exam.proctorScreenshareRequired ? true : false;

  // Close any previous active session for this subject (prevents multi-sessions)
  const tsNow = nowIso();
  await db.run(
    `UPDATE exam_proctor_sessions SET status='ENDED', ended_at=?, last_event_at=? 
     WHERE user_id=? AND subject_id=? AND status='ACTIVE'`,
    [tsNow, tsNow, req.user.id, subjectId]
  );

  // Build a randomized paper for this session (questions + shuffled options), with answers kept server-side
  const full = safeParseJsonArray(exam.questionsJson);
  const perAttempt = parseInt(process.env.EXAM_QUESTIONS_PER_ATTEMPT || '0', 10); // 0 => all
  const seedInt = Math.floor(Math.random() * 2 ** 31);
  const rng = mulberry32(seedInt);

  const normalized = full.map((q, idx) => ({
    id: q.id ?? idx + 1,
    text: q.text ?? q.question ?? '',
    options: Array.isArray(q.options) ? q.options : [],
    correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : (typeof q.correct_index === 'number' ? q.correct_index : 0)
  }));

  let picked = normalized;
  if (perAttempt > 0 && perAttempt < normalized.length) {
    picked = seededShuffle(normalized, rng).slice(0, perAttempt);
  }

  // Shuffle question order
  const paperQ = seededShuffle(picked, rng).map((q) => {
    const idxs = q.options.map((_, i) => i);
    const shuffledIdxs = seededShuffle(idxs, rng);
    const newOptions = shuffledIdxs.map((i) => q.options[i]);
    const newCorrect = shuffledIdxs.indexOf(q.correctIndex);
    return { id: q.id, text: q.text, options: newOptions, correctIndex: Math.max(0, newCorrect) };
  });

  const paperJson = safeJson({ seed: seedInt, durationMinutes: exam.durationMinutes, questions: paperQ });
  const paperHash = sha256(paperJson);

  const startedAt = nowIso();
  const clientInfo = safeJson(req.body?.clientInfo);
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null;
  const ua = req.headers['user-agent'] || null;
  const fingerprint = req.body?.clientInfo?.fingerprint || null;

  const ins = await db.run(
    `INSERT INTO exam_proctor_sessions
      (user_id, subject_id, started_at, status, mode, warning_count, events_count, snapshots_count, last_event_at, client_info,
       ip_address, user_agent, fingerprint, paper_json, paper_hash, screenshare_enabled)
     VALUES (?, ?, ?, 'ACTIVE', ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, subjectId, startedAt, mode, startedAt, clientInfo, ip, ua, fingerprint, paperJson, paperHash, screenshareEnabled]
  );

  return res.json({ sessionId: ins.lastID, startedAt, mode, screenshareEnabled });
});



// Resume an active proctor session (if any)
router.get('/student/exams/:subjectId/proctor/active', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const subjectId = parseInt(req.params.subjectId, 10);
  const sess = await db.get(
    `SELECT id AS "sessionId", mode, warning_count AS "warningCount", started_at AS "startedAt", screenshare_enabled AS "screenshareEnabled"
     FROM exam_proctor_sessions
     WHERE user_id=? AND subject_id=? AND status='ACTIVE'
     ORDER BY id DESC LIMIT 1`,
    [req.user.id, subjectId]
  );
  return res.json({ active: sess || null });
});

// Get the randomized exam paper for a proctor session (answers hidden)
router.get('/student/exams/:subjectId/proctor/paper', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const subjectId = parseInt(req.params.subjectId, 10);
  const sessionId = parseInt(req.query?.sessionId, 10);
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const sess = await db.get(
    `SELECT id, status, paper_json AS "paperJson", paper_hash AS "paperHash" FROM exam_proctor_sessions
     WHERE id=? AND user_id=? AND subject_id=?`,
    [sessionId, req.user.id, subjectId]
  );
  if (!sess) return res.status(404).json({ error: 'Proctor session not found' });
  if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Proctor session is not active' });
  if (!sess.paperJson) return res.status(500).json({ error: 'Paper not available' });

  let paper = null;
  try { paper = safeParseJson(sess.paperJson); } catch { paper = null; }
  if (!paper || !Array.isArray(paper.questions)) return res.status(500).json({ error: 'Paper invalid' });

  const questions = paper.questions.map((q) => ({ id: q.id, text: q.text, options: q.options }));
  return res.json({ paper: { durationMinutes: paper.durationMinutes, questionCount: questions.length, questions }, paperHash: sess.paperHash });
});

// Log a proctoring event (tab switch / blur / fullscreen exit / etc.)
router.post('/student/exams/:subjectId/proctor/event', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const subjectId = parseInt(req.params.subjectId, 10);
  const sessionId = parseInt(req.body?.sessionId, 10);
  const type = (req.body?.type || '').toUpperCase();
  const meta = req.body?.meta;

  if (!sessionId || !type) return res.status(400).json({ error: 'sessionId and type are required' });

  const sess = await db.get(
    `SELECT id, status FROM exam_proctor_sessions WHERE id=? AND user_id=? AND subject_id=?`,
    [sessionId, req.user.id, subjectId]
  );
  if (!sess) return res.status(404).json({ error: 'Proctor session not found' });
  if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Proctor session is not active' });

  const createdAt = nowIso();
  await db.run(
    `INSERT INTO exam_proctor_events (session_id, event_type, meta, created_at) VALUES (?, ?, ?, ?)`,
    [sessionId, type, safeJson(meta), createdAt]
  );

  const isViolation = VIOLATION_EVENT_TYPES.has(type);
  await db.run(
    `UPDATE exam_proctor_sessions
     SET events_count = events_count + 1,
         warning_count = warning_count + ?,
         last_event_at = ?
     WHERE id=?`,
    [isViolation ? 1 : 0, createdAt, sessionId]
  );

  return res.json({ ok: true, isViolation: !!isViolation });
});

// Upload a webcam snapshot (optional; requires explicit user consent in the UI)
router.post('/student/exams/:subjectId/proctor/snapshot', requireAuth, requireRole('student'), proctorUpload.single('snapshot'), async (req, res) => {
  const db = await getDb();
  const subjectId = parseInt(req.params.subjectId, 10);
  const sessionId = parseInt(req.body?.sessionId, 10);
  const snapshotType = (req.body?.snapshotType || 'WEBCAM').toString().toUpperCase() === 'SCREEN' ? 'SCREEN' : 'WEBCAM';

  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const sess = await db.get(
    `SELECT id, status FROM exam_proctor_sessions WHERE id=? AND user_id=? AND subject_id=?`,
    [sessionId, req.user.id, subjectId]
  );
  if (!sess) return res.status(404).json({ error: 'Proctor session not found' });
  if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Proctor session is not active' });
  if (!req.file) return res.status(400).json({ error: 'snapshot file is required' });

  // Move file into a per-session folder
  const sessDir = path.join(PROCTOR_DIR, String(sessionId));
  try { fs.mkdirSync(sessDir, { recursive: true }); } catch {}

  const ext = path.extname(req.file.originalname || '') || '.jpg';
  const destName = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
  const destPath = path.join(sessDir, destName);

  try {
    fs.renameSync(req.file.path, destPath);
  } catch (e) {
    // fallback copy
    fs.copyFileSync(req.file.path, destPath);
    try { fs.unlinkSync(req.file.path); } catch {}
  }

  const createdAt = nowIso();
  const relPath = path.relative(UPLOAD_DIR, destPath).replace(/\\/g, '/');
  await db.run(
    `INSERT INTO exam_proctor_snapshots (session_id, file_path, snapshot_type, created_at) VALUES (?, ?, ?, ?)`,
    [sessionId, relPath, snapshotType, createdAt]
  );

  await db.run(
    `UPDATE exam_proctor_sessions SET snapshots_count = snapshots_count + 1, last_event_at = ? WHERE id=?`,
    [createdAt, sessionId]
  );

  return res.json({ ok: true });
});

// Get active proctor session for COURSE-BASED exam
router.get('/student/courses/:courseId/exam/proctor/active', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const courseId = parseInt(req.params.courseId, 10);
  const sess = await db.get(
    `SELECT id AS "sessionId", mode, warning_count AS "warningCount", started_at AS "startedAt", screenshare_enabled AS "screenshareEnabled"
     FROM exam_proctor_sessions
     WHERE user_id=? AND course_id=? AND status='ACTIVE'
     ORDER BY id DESC LIMIT 1`,
    [req.user.id, courseId]
  );
  return res.json({ active: sess || null });
});

// Get the randomized exam paper for a COURSE-BASED proctor session (answers hidden)
router.get('/student/courses/:courseId/exam/proctor/paper', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const courseId = parseInt(req.params.courseId, 10);
  const sessionId = parseInt(req.query?.sessionId, 10);
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  console.log(`📋 Fetching paper: sessionId=${sessionId}, userId=${req.user.id}, courseId=${courseId}`);

  const sess = await db.get(
    `SELECT id, status, paper_json AS "paperJson", paper_hash AS "paperHash", user_id, course_id 
     FROM exam_proctor_sessions
     WHERE id=? AND user_id=? AND course_id=?`,
    [sessionId, req.user.id, courseId]
  );
  
  if (!sess) {
    console.error(`❌ Session not found with exact query. Checking for any session with id=${sessionId}`);
    const debugSession = await db.get(
      `SELECT id, user_id, course_id, subject_id, status FROM exam_proctor_sessions WHERE id=?`,
      [sessionId]
    );
    if (debugSession) {
      console.error(`   Found session but mismatch: ${JSON.stringify(debugSession)}`);
      return res.status(403).json({ error: 'Session does not match your course', debug: debugSession });
    }
    return res.status(404).json({ error: 'Proctor session not found' });
  }
  
  console.log(`✅ Found session: id=${sess.id}, status=${sess.status}`);
  
  if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Proctor session is not active' });
  if (!sess.paperJson) return res.status(500).json({ error: 'Paper not available' });

  let paper = null;
  try { paper = safeParseJson(sess.paperJson); } catch { paper = null; }
  if (!paper || !Array.isArray(paper.questions)) return res.status(500).json({ error: 'Paper invalid' });

  const questions = paper.questions.map((q) => ({ id: q.id, text: q.text, options: q.options }));
  return res.json({ paper: { durationMinutes: paper.durationMinutes, questionCount: questions.length, questions }, paperHash: sess.paperHash });
});

// Log a proctoring event for COURSE-BASED exam
router.post('/student/courses/:courseId/exam/proctor/event', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const courseId = parseInt(req.params.courseId, 10);
  const sessionId = parseInt(req.body?.sessionId, 10);
  const type = (req.body?.type || '').toUpperCase();
  const meta = req.body?.meta;

  if (!sessionId || !type) return res.status(400).json({ error: 'sessionId and type are required' });

  const sess = await db.get(
    `SELECT id, status FROM exam_proctor_sessions WHERE id=? AND user_id=? AND course_id=?`,
    [sessionId, req.user.id, courseId]
  );
  if (!sess) {
    console.error(`Proctor session not found for event: sessionId=${sessionId}, userId=${req.user.id}, courseId=${courseId}, type=${type}`);
    return res.status(404).json({ error: 'Proctor session not found' });
  }
  if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Proctor session is not active' });

  const createdAt = nowIso();
  await db.run(
    `INSERT INTO exam_proctor_events (session_id, event_type, meta, created_at) VALUES (?, ?, ?, ?)`,
    [sessionId, type, safeJson(meta), createdAt]
  );

  const isViolation = VIOLATION_EVENT_TYPES.has(type);
  await db.run(
    `UPDATE exam_proctor_sessions
     SET events_count = events_count + 1,
         warning_count = warning_count + ?,
         last_event_at = ?
     WHERE id=?`,
    [isViolation ? 1 : 0, createdAt, sessionId]
  );

  return res.json({ ok: true, isViolation: !!isViolation });
});

// Upload a webcam snapshot for COURSE-BASED exam
router.post('/student/courses/:courseId/exam/proctor/snapshot', requireAuth, requireRole('student'), proctorUpload.single('snapshot'), async (req, res) => {
  const db = await getDb();
  const courseId = parseInt(req.params.courseId, 10);
  const sessionId = parseInt(req.body?.sessionId, 10);
  const snapshotType = (req.body?.snapshotType || 'WEBCAM').toString().toUpperCase() === 'SCREEN' ? 'SCREEN' : 'WEBCAM';

  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const sess = await db.get(
    `SELECT id, status FROM exam_proctor_sessions WHERE id=? AND user_id=? AND course_id=?`,
    [sessionId, req.user.id, courseId]
  );
  if (!sess) return res.status(404).json({ error: 'Proctor session not found' });
  if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Proctor session is not active' });
  if (!req.file) return res.status(400).json({ error: 'snapshot file is required' });

  // Move file into a per-session folder
  const sessDir = path.join(PROCTOR_DIR, String(sessionId));
  try { fs.mkdirSync(sessDir, { recursive: true }); } catch {}

  const ext = path.extname(req.file.originalname || '') || '.jpg';
  const destName = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
  const destPath = path.join(sessDir, destName);

  try {
    fs.renameSync(req.file.path, destPath);
  } catch (e) {
    // fallback copy
    fs.copyFileSync(req.file.path, destPath);
    try { fs.unlinkSync(req.file.path); } catch {}
  }

  const createdAt = nowIso();
  const relPath = path.relative(UPLOAD_DIR, destPath).replace(/\\/g, '/');
  await db.run(
    `INSERT INTO exam_proctor_snapshots (session_id, file_path, snapshot_type, created_at) VALUES (?, ?, ?, ?)`,
    [sessionId, relPath, snapshotType, createdAt]
  );

  await db.run(
    `UPDATE exam_proctor_sessions SET snapshots_count = snapshots_count + 1, last_event_at = ? WHERE id=?`,
    [createdAt, sessionId]
  );

  return res.json({ ok: true });
});

// Student: submit exam attempt for a course (NEW - course-based)
router.post('/student/courses/:courseId/exam/attempt', requireAuth, requireRole('student'), async (req, res) => {
  const { answers } = req.body || {}; // {questionId: selectedIndex}
  const proctorSessionId = req.body?.proctorSessionId ? parseInt(req.body.proctorSessionId, 10) : null;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'answers required' });

  const db = await getDb();
  const course = await db.get(
    `SELECT id, title, code FROM courses WHERE id=?`,
    [req.params.courseId]
  );
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const elig = await ensureEligible(db, req.user.id, course.id);
  if (!elig.ok) return res.status(400).json({ error: elig.reason });

  const exam = await db.get(`SELECT id, questions_json AS "questionsJson" FROM exams WHERE course_id=?`, [course.id]);
  if (!exam) return res.status(404).json({ error: 'Exam not configured' });

  const PROCTOR_REQUIRED = (process.env.PROCTOR_REQUIRED || '1') === '1';
  if (PROCTOR_REQUIRED && !proctorSessionId) {
    return res.status(400).json({ error: 'Proctoring session is required to submit this exam.' });
  }

  // Retake rule
  const latest = await db.get(
    `SELECT attempt_no AS "attemptNo", passed, result_release_at AS "resultReleaseAt"
     FROM exam_attempts WHERE user_id=? AND course_id=? ORDER BY attempt_no DESC LIMIT 1`,
    [req.user.id, course.id]
  );

  if (latest && latest.passed) {
    return res.status(400).json({ error: 'You already passed this course exam. Retake not allowed.' });
  }

  let questionsFull = null;
  let proctorWarningCount = 0;
  let proctorFlags = null;
  let suspiciousScore = 0;

  if (proctorSessionId) {
    const sess = await db.get(
      `SELECT id, status, paper_json AS "paperJson", warning_count AS warningCount, 
              events_count AS "eventsCount", snapshots_count AS "snapshotsCount",
              started_at AS "startedAt", last_event_at AS "lastEventAt", mode
       FROM exam_proctor_sessions
       WHERE id=? AND user_id=? AND course_id=?`,
      [proctorSessionId, req.user.id, course.id]
    );
    if (!sess) return res.status(400).json({ error: 'Invalid proctor session.' });
    if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Session not active.' });

    const paper = safeParseJson(sess.paperJson);
    questionsFull = Array.isArray(paper.questions) ? paper.questions : null;
    proctorWarningCount = sess.warningCount || 0;

    // Compute suspicious score from events (best-effort) for course-based exams
    try {
      const rows = await db.all(
        `SELECT event_type AS "eventType", COUNT(*) AS cnt
         FROM exam_proctor_events WHERE session_id=? GROUP BY event_type`,
        [proctorSessionId]
      );
      const weights = {
        TAB_HIDDEN: 3,
        WINDOW_BLUR: 2,
        FULLSCREEN_EXIT: 5,
        COPY_ATTEMPT: 4,
        PASTE_ATTEMPT: 4,
        RIGHT_CLICK: 1,
        NAV_AWAY: 5,
        DEVTOOLS_SUSPECTED: 6,
        KEY_COMBO: 3,
        PRINTSCREEN: 4,
        MULTI_TAB: 6,
        SCREENSHARE_DENIED: 3,
        SCREENSHARE_STOPPED: 6
      };
      suspiciousScore = (rows || []).reduce((sum, r) => sum + (weights[(r.eventType || '').toUpperCase()] || 0) * (r.cnt || 0), 0);
    } catch {
      // ignore
    }

    // Build proctoring flags/summary
    proctorFlags = safeJson({
      mode: sess.mode,
      warningCount: proctorWarningCount,
      eventsCount: sess.eventsCount || 0,
      snapshotsCount: sess.snapshotsCount || 0,
      startedAt: sess.startedAt,
      lastEventAt: sess.lastEventAt,
      suspiciousScore
    });
  } else {
    questionsFull = safeParseJsonArray(exam.questionsJson);
  }

  if (!questionsFull) return res.status(500).json({ error: 'Exam paper not available.' });

  // Evaluate
  let correct = 0;
  for (const q of questionsFull) {
    const userAnswerIndex = answers[q.id] !== undefined ? parseInt(answers[q.id], 10) : -1;
    if (userAnswerIndex === q.correctIndex) correct++;
  }

  const scorePercent = Math.round((correct / questionsFull.length) * 100);
  const passed = scorePercent >= 50;
  const ts = nowIso();
  const nextAttemptNo = (latest?.attemptNo || 0) + 1;
  const resultReleaseAt = dayjs(ts).add(RESULT_RELEASE_DAYS, 'day').format('YYYY-MM-DD HH:mm:ss');

  // Close the proctoring session on submit if exists
  if (proctorSessionId) {
    await db.run(
      `UPDATE exam_proctor_sessions SET status='SUBMITTED', ended_at=?, last_event_at=?, suspicious_score=? WHERE id=?`,
      [ts, ts, suspiciousScore, proctorSessionId]
    );
  }

  const result = await db.run(
    `INSERT INTO exam_attempts (user_id, course_id, attempt_no, started_at, submitted_at, score_percent, passed, evaluated_at, result_release_at, proctor_session_id, proctor_warning_count, proctor_flags, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, course.id, nextAttemptNo, ts, scorePercent, passed ? 1 : 0, ts, resultReleaseAt, proctorSessionId, proctorWarningCount, proctorFlags, ts, ts]
  );

  if (passed) {
    const certificateNo = randomCertificateNo(course.code);
    await db.run(
      `INSERT INTO certificates (user_id, course_id, certificate_no, issued_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, course.id, certificateNo, ts, ts, ts]
    );
  }

  return res.json({ attemptId: result.lastID, scorePercent, passed, resultReleaseAt });
});

router.post('/student/exams/:subjectId/attempt', requireAuth, requireRole('student'), async (req, res) => {
  const { answers } = req.body || {}; // {questionId: selectedIndex}
  const proctorSessionId = req.body?.proctorSessionId ? parseInt(req.body.proctorSessionId, 10) : null;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'answers required' });

  const db = await getDb();
  const subject = await db.get(
    `SELECT s.id AS "subjectId", s.passing_score AS "passingScore", s.course_id AS "courseId",
            c.title AS "courseTitle", c.code AS "courseCode"
     FROM subjects s JOIN courses c ON c.id=s.course_id
     WHERE s.id=?`,
    [req.params.subjectId]
  );
  if (!subject) return res.status(404).json({ error: 'Subject not found' });

  const elig = await ensureEligible(db, req.user.id, subject.courseId);
  if (!elig.ok) return res.status(400).json({ error: elig.reason });

  const exam = await db.get(`SELECT id, questions_json AS "questionsJson" FROM exams WHERE subject_id=?`, [subject.subjectId]);
  if (!exam) return res.status(404).json({ error: 'Exam not configured' });

  const PROCTOR_REQUIRED = (process.env.PROCTOR_REQUIRED || '1') === '1';
  if (PROCTOR_REQUIRED && !proctorSessionId) {
    return res.status(400).json({ error: 'Proctoring session is required to submit this exam.' });
  }

  // Retake rule: only if failed, and only after (result_release_at + gap) where gap starts after result release
  const latest = await db.get(
    `SELECT attempt_no AS "attemptNo", passed, result_release_at AS "resultReleaseAt"
     FROM exam_attempts WHERE user_id=? AND subject_id=? ORDER BY attempt_no DESC LIMIT 1`,
    [req.user.id, subject.subjectId]
  );

  if (latest) {
    if (latest.passed) {
      return res.status(400).json({ error: 'You already passed this subject. Retake not allowed.' });
    }
    if (latest.resultReleaseAt) {
      const release = dayjs(latest.resultReleaseAt);
      const nextAllowedAt = release.add(RETAKE_GAP_DAYS, 'day');
      if (dayjs().isBefore(nextAllowedAt)) {
        return res.status(429).json({
          error: 'Retake cooldown active',
          nextAllowedAt: nextAllowedAt.toISOString(),
          rule: { retakeGapDays: RETAKE_GAP_DAYS, startsAfterResultRelease: true }
        });
      }
    }
  }

  // Determine the exact question paper used for this attempt
  let questionsFull = null;

  // Proctoring summary (if proctor session exists)
  let proctorWarningCount = 0;
  let proctorFlags = null;
  let suspiciousScore = 0;
  let proctorSummary = null;

  if (proctorSessionId) {
    const sess = await db.get(
      `SELECT id, status, mode, paper_json AS "paperJson", warning_count AS "warningCount",
              events_count AS "eventsCount", snapshots_count AS "snapshotsCount",
              started_at AS "startedAt", last_event_at AS "lastEventAt"
       FROM exam_proctor_sessions
       WHERE id=? AND user_id=? AND subject_id=?`,
      [proctorSessionId, req.user.id, subject.subjectId]
    );
    if (!sess) return res.status(400).json({ error: 'Invalid proctor session for this exam.' });
    if (sess.status !== 'ACTIVE') return res.status(409).json({ error: 'Proctor session is not active.' });

    // Use the server-generated paper (randomized questions + options)
    try {
      const paper = safeParseJson(sess.paperJson);
      questionsFull = Array.isArray(paper.questions) ? paper.questions : null;
    } catch {
      questionsFull = null;
    }
    if (!questionsFull) return res.status(500).json({ error: 'Exam paper not available. Please restart the exam.' });

    // Compute suspicious score from events (best-effort)
    try {
      const rows = await db.all(
        `SELECT event_type AS "eventType", COUNT(*) AS cnt
         FROM exam_proctor_events WHERE session_id=? GROUP BY event_type`,
        [proctorSessionId]
      );
      const weights = {
        TAB_HIDDEN: 3,
        WINDOW_BLUR: 2,
        FULLSCREEN_EXIT: 5,
        COPY_ATTEMPT: 4,
        PASTE_ATTEMPT: 4,
        RIGHT_CLICK: 1,
        NAV_AWAY: 5,
        DEVTOOLS_SUSPECTED: 6,
        KEY_COMBO: 3,
        PRINTSCREEN: 4,
        MULTI_TAB: 6,
        SCREENSHARE_DENIED: 3,
        SCREENSHARE_STOPPED: 6
      };
      suspiciousScore = (rows || []).reduce((sum, r) => sum + (weights[(r.eventType || '').toUpperCase()] || 0) * (r.cnt || 0), 0);
      proctorSummary = { suspiciousScore, events: rows };
    } catch {
      // ignore
    }

    proctorWarningCount = sess.warningCount || 0;
    proctorFlags = safeJson({
      mode: sess.mode,
      warningCount: proctorWarningCount,
      eventsCount: sess.eventsCount || 0,
      snapshotsCount: sess.snapshotsCount || 0,
      startedAt: sess.startedAt,
      lastEventAt: sess.lastEventAt,
      suspiciousScore,
      summary: proctorSummary
    });
  } else {
    // Fallback (non-proctored) paper: use configured exam questions
    questionsFull = safeParseJsonArray(exam.questionsJson);
  }

  // Evaluate
  let correct = 0;
  for (const q of questionsFull) {
    const qid = q.id;
    const sel = answers[qid];
    if (typeof sel === 'number' && sel === q.correctIndex) correct += 1;
  }
  const total = Math.max(1, questionsFull.length);
  const scorePercent = Math.round((correct / total) * 100);
  const passed = scorePercent >= (subject.passingScore ?? 40);

  const attemptNo = (latest?.attemptNo || 0) + 1;
  const startedAt = nowIso();
  const submittedAt = nowIso();
  const evaluatedAt = nowIso();
  const resultReleaseAt = addDaysIso(submittedAt, RESULT_RELEASE_DAYS);
  const cooldownUntil = passed ? null : addDaysIso(resultReleaseAt, RETAKE_GAP_DAYS);
  const ts = nowIso();

  if (proctorSessionId) {
    // Close the session on submit and persist suspicious score
    await db.run(
      `UPDATE exam_proctor_sessions SET status='SUBMITTED', ended_at=?, last_event_at=?, suspicious_score=? WHERE id=?`,
      [ts, ts, suspiciousScore, proctorSessionId]
    );
  }

  await db.run(
    `INSERT INTO exam_attempts
      (user_id, course_id, subject_id, attempt_no, started_at, submitted_at, score_percent, passed,
       evaluated_at, result_release_at, cooldown_until, retake_gap_days,
       proctor_session_id, proctor_warning_count, proctor_flags,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.id, subject.courseId, subject.subjectId, attemptNo, startedAt, submittedAt, scorePercent, passed ? 1 : 0,
     evaluatedAt, resultReleaseAt, cooldownUntil, RETAKE_GAP_DAYS,
     proctorSessionId, proctorWarningCount, proctorFlags,
     ts, ts]
  );

  // DO NOT issue certificate automatically on exam pass
  // Certificate should only be issued when admin marks course as COMPLETED
  // This ensures we control when the student sees they have certified
  // Previous code that auto-issued certificates has been removed

  // Email result notice (best-effort): don't reveal score before release; just informs release time
  await sendEmail({
    to: req.user.email,
    subject: 'Exam submitted - result will be released',
    text: `Your exam attempt was submitted. Result will be available after ${RESULT_RELEASE_DAYS} day(s).

Course: ${subject.courseTitle}
Subject ID: ${subject.subjectId}
Attempt: ${attemptNo}
Result release at: ${resultReleaseAt}`,
    html: `<p>Your exam attempt was submitted.</p><p>Result will be available after <strong>${RESULT_RELEASE_DAYS} day(s)</strong>.</p>
           <ul><li><strong>Course:</strong> ${subject.courseTitle}</li><li><strong>Attempt:</strong> ${attemptNo}</li><li><strong>Result release at:</strong> ${resultReleaseAt}</li></ul>`
  }).catch(() => {});

  return res.json({
    ok: true,
    attempt: {
      attemptNo,
      scorePercent,
      passed,
      submittedAt,
      resultReleaseAt,
      resultVisible: dayjs().isAfter(dayjs(resultReleaseAt))
    }
  });
});


// Student: view results for a subject (only if released)
router.get('/student/results/:subjectId', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const latest = await db.get(
    `SELECT attempt_no AS "attemptNo", score_percent AS "scorePercent", passed,
            submitted_at AS "submittedAt", result_release_at AS "resultReleaseAt"
     FROM exam_attempts WHERE user_id=? AND subject_id=? ORDER BY attempt_no DESC LIMIT 1`,
    [req.user.id, req.params.subjectId]
  );
  if (!latest) return res.json({ status: 'NO_ATTEMPT' });

  const now = dayjs();
  const releaseAt = dayjs(latest.resultReleaseAt);
  if (now.isBefore(releaseAt)) {
    return res.json({ status: 'PENDING', resultReleaseAt: latest.resultReleaseAt });
  }

  return res.json({
    status: 'RELEASED',
    result: {
      ...latest,
      passed: !!latest.passed
    }
  });
});

// Admin: results list
router.get('/admin/results', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const rows = await db.all(
    `SELECT a.id, a.attempt_no AS "attemptNo", a.score_percent AS "scorePercent", a.passed,
            a.submitted_at AS "submittedAt", a.evaluated_at AS "evaluatedAt", a.result_release_at AS "resultReleaseAt",
            a.proctor_session_id AS "proctorSessionId", a.proctor_warning_count AS "proctorWarningCount", a.proctor_flags AS "proctorFlags",
            u.email AS "studentEmail", u.name AS "studentName", u.id AS "studentId",
            s.name AS "subjectName", c.title AS "courseTitle"
     FROM exam_attempts a
     JOIN users u ON u.id=a.user_id
     LEFT JOIN subjects s ON s.id=a.subject_id
     JOIN courses c ON c.id=a.course_id
     WHERE a.submitted_at IS NOT NULL
     ORDER BY a.id DESC`
  );
  return res.json({ results: rows.map(r => ({ ...r, passed: !!r.passed })) });
});

// Admin: get exam for a subject
// Admin: get exam for a course (NEW - course-based)
router.get('/admin/courses/:courseId/exam', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const exam = await db.get(
    `SELECT id, title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
            exam_type AS "examType", question_type_config AS "questionTypeConfig",
            proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
            proctor_screenshare_required AS "proctorScreenshareRequired"
     FROM exams WHERE course_id = ?`,
    [req.params.courseId]
  );
  if (!exam) return res.json({ exam: null });

  try {
    const questions = (typeof exam.questionsJson === 'string' ? JSON.parse(exam.questionsJson) : exam.questionsJson) || [];
    const questionTypeConfig = safeParseJson(exam.questionTypeConfig);
    return res.json({ exam: { ...exam, questions, questionTypeConfig } });
  } catch {
    return res.json({ exam: { ...exam, questions: [], questionTypeConfig: {} } });
  }
});

// Admin: get exam for a subject (DEPRECATED - kept for backward compatibility)
router.get('/admin/subjects/:subjectId/exam', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const exam = await db.get(
    `SELECT id, title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
            exam_type AS "examType", question_type_config AS "questionTypeConfig",
            proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
            proctor_screenshare_required AS "proctorScreenshareRequired"
     FROM exams WHERE subject_id = ?`,
    [req.params.subjectId]
  );
  if (!exam) return res.json({ exam: null });

  try {
    const questions = (typeof exam.questionsJson === 'string' ? JSON.parse(exam.questionsJson) : exam.questionsJson) || [];
    const questionTypeConfig = safeParseJson(exam.questionTypeConfig);
    return res.json({ exam: { ...exam, questions, questionTypeConfig } });
  } catch {
    return res.json({ exam: { ...exam, questions: [], questionTypeConfig: {} } });
  }
});

// Student: get certificates
router.get('/student/certificates', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const certs = await db.all(
    `SELECT c.id, c.certificate_no AS "certificateNo", c.issued_at AS "issuedAt",
            co.id AS "courseId", co.title AS "courseTitle", co.code AS "courseCode"
     FROM certificates c
     JOIN courses co ON co.id=c.course_id
     WHERE c.user_id=?
     ORDER BY c.issued_at DESC`,
    [req.user.id]
  );
  return res.json({ certificates: certs });
});

// Student: get certificate details
router.get('/student/certificates/:certificateId', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const cert = await db.get(
    `SELECT c.id, c.certificate_no AS "certificateNo", c.issued_at AS "issuedAt",
            co.id AS "courseId", co.title AS "courseTitle", co.code AS "courseCode", co.duration,
            u.name AS "studentName", u.email AS "studentEmail"
     FROM certificates c
     JOIN courses co ON co.id=c.course_id
     JOIN users u ON u.id=c.user_id
     WHERE c.id=? AND c.user_id=?`,
    [req.params.certificateId, req.user.id]
  );
  if (!cert) return res.status(404).json({ error: 'Certificate not found' });
  return res.json({ certificate: cert });
});

// Admin: create/update exam for a course (NEW - course-based)
router.post(
  '/admin/courses/:courseId/exam',
  requireAuth,
  requireRole('admin'),
  body('title').isLength({ min: 2 }).trim(),
  body('questions').isArray({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const db = await getDb();
    const course = await db.get('SELECT id FROM courses WHERE id = ?', [req.params.courseId]);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const ts = nowIso();
    const {
      title,
      durationMinutes,
      questions,
      examType = 'MIXED',
      questionTypeConfig = {},
      proctorRequired = false,
      proctorMode = 'BASIC',
      proctorScreenshareRequired = false
    } = req.body;

    // One exam per course: upsert
    const existing = await db.get('SELECT id FROM exams WHERE course_id = ?', [req.params.courseId]);
    if (existing) {
      await db.run(
        `UPDATE exams SET title=?, duration_minutes=?, questions_json=?, exam_type=?, question_type_config=?,
         proctor_required=?, proctor_mode=?, proctor_screenshare_required=?, updated_at=? WHERE id=?`,
        [
          title,
          durationMinutes ?? 30,
          JSON.stringify(questions),
          examType,
          JSON.stringify(questionTypeConfig),
          proctorRequired ? 1 : 0,
          proctorMode,
          proctorScreenshareRequired ? 1 : 0,
          ts,
          existing.id
        ]
      );
      const exam = await db.get(
        `SELECT id, title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
                exam_type AS "examType", question_type_config AS "questionTypeConfig",
                proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
                proctor_screenshare_required AS "proctorScreenshareRequired" FROM exams WHERE id = ?`,
        [existing.id]
      );
      const questionTypeConfigParsed = safeParseJson(exam.questionTypeConfig);
      return res.json({ exam: { ...exam, questions, questionTypeConfig: questionTypeConfigParsed } });
    }

    const result = await db.run(
      `INSERT INTO exams (course_id,title,duration_minutes,questions_json,exam_type,question_type_config,
                          proctor_required,proctor_mode,proctor_screenshare_required,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.params.courseId,
        title,
        durationMinutes ?? 30,
        JSON.stringify(questions),
        examType,
        JSON.stringify(questionTypeConfig),
        proctorRequired ? 1 : 0,
        proctorMode,
        proctorScreenshareRequired ? 1 : 0,
        ts,
        ts
      ]
    );
    const exam = await db.get(
      `SELECT id, title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
              exam_type AS "examType", question_type_config AS "questionTypeConfig",
              proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
              proctor_screenshare_required AS "proctorScreenshareRequired" FROM exams WHERE id = ?`,
      [result.lastID]
    );
    const questionTypeConfigParsed = safeParseJson(exam.questionTypeConfig);
    return res.json({ exam: { ...exam, questions, questionTypeConfig: questionTypeConfigParsed } });
  }
);

// Admin: create/update exam for a subject (DEPRECATED - kept for backward compatibility)
router.post(
  '/admin/subjects/:subjectId/exam',
  requireAuth,
  requireRole('admin'),
  body('title').isLength({ min: 2 }).trim(),
  body('questions').isArray({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const db = await getDb();
    const subject = await db.get('SELECT id FROM subjects WHERE id = ?', [req.params.subjectId]);
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const ts = nowIso();
    const {
      title,
      durationMinutes,
      questions,
      examType = 'MIXED',
      questionTypeConfig = {},
      proctorRequired = false,
      proctorMode = 'BASIC',
      proctorScreenshareRequired = false
    } = req.body;

    // One exam per subject for now: upsert
    const existing = await db.get('SELECT id FROM exams WHERE subject_id = ?', [req.params.subjectId]);
    if (existing) {
      await db.run(
        `UPDATE exams SET title=?, duration_minutes=?, questions_json=?, exam_type=?, question_type_config=?,
         proctor_required=?, proctor_mode=?, proctor_screenshare_required=?, updated_at=? WHERE id=?`,
        [
          title,
          durationMinutes ?? 30,
          JSON.stringify(questions),
          examType,
          JSON.stringify(questionTypeConfig),
          proctorRequired ? 1 : 0,
          proctorMode,
          proctorScreenshareRequired ? 1 : 0,
          ts,
          existing.id
        ]
      );
      const exam = await db.get(
        `SELECT id, title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
                exam_type AS "examType", question_type_config AS "questionTypeConfig",
                proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
                proctor_screenshare_required AS "proctorScreenshareRequired" FROM exams WHERE id = ?`,
        [existing.id]
      );
      const questionTypeConfigParsed = exam.questionTypeConfig ? JSON.parse(exam.questionTypeConfig) : {};
      return res.json({ exam: { ...exam, questions, questionTypeConfig: questionTypeConfigParsed } });
    }

    const result = await db.run(
      `INSERT INTO exams (subject_id,title,duration_minutes,questions_json,exam_type,question_type_config,
                          proctor_required,proctor_mode,proctor_screenshare_required,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        examType,
        JSON.stringify(questionTypeConfig),
        proctorRequired ? 1 : 0,
        proctorMode,
        proctorScreenshareRequired ? 1 : 0,
        ts,
        ts
      ]
    );
    const exam = await db.get(
      `SELECT id, title, duration_minutes AS "durationMinutes", questions_json AS "questionsJson",
              exam_type AS "examType", question_type_config AS "questionTypeConfig",
              proctor_required AS "proctorRequired", proctor_mode AS "proctorMode",
              proctor_screenshare_required AS "proctorScreenshareRequired" FROM exams WHERE id = ?`,
      [result.lastID]
    );
    const questionTypeConfigParsed = exam.questionTypeConfig ? JSON.parse(exam.questionTypeConfig) : {};
    return res.json({ exam: { ...exam, questions, questionTypeConfig: questionTypeConfigParsed } });
  }
);

module.exports = router;
