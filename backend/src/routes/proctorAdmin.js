const express = require('express');
const dayjs = require('dayjs');

const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Admin: list proctor sessions
router.get('/admin/proctor/sessions', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();

  const q = (req.query?.q || '').toString().trim().toLowerCase();
  const status = (req.query?.status || '').toString().trim().toUpperCase();
  const review = (req.query?.review || '').toString().trim().toUpperCase();
  const from = (req.query?.from || '').toString().trim();
  const to = (req.query?.to || '').toString().trim();

  const where = [];
  const params = [];

  if (q) {
    where.push(`(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ? OR CAST(ps.id AS CHAR) = ?)`);
    params.push(`%${q}%`, `%${q}%`, q);
  }
  if (status) {
    where.push(`ps.status = ?`);
    params.push(status);
  }
  if (review) {
    where.push(`ps.review_status = ?`);
    params.push(review);
  }
  if (from) {
    where.push(`ps.started_at >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`ps.started_at <= ?`);
    params.push(to);
  }

  const sql = `
    SELECT ps.id AS "sessionId", ps.status, ps.mode, ps.started_at AS "startedAt", ps.ended_at AS "endedAt",
           ps.warning_count AS "warningCount", ps.events_count AS "eventsCount", ps.snapshots_count AS "snapshotsCount",
           ps.suspicious_score AS "suspiciousScore", ps.review_status AS "reviewStatus", ps.screenshare_enabled AS "screenshareEnabled",
           u.id AS "userId", u.email AS "studentEmail", u.name AS "studentName",
           s.id AS "subjectId", s.name AS "subjectName",
           c.id AS "courseId", c.title AS "courseTitle",
           ea.id AS "attemptId", ea.submitted_at AS "attemptSubmittedAt"
    FROM exam_proctor_sessions ps
    JOIN users u ON u.id = ps.user_id
    LEFT JOIN subjects s ON s.id = ps.subject_id
    LEFT JOIN courses c ON c.id = CASE 
      WHEN ps.course_id IS NOT NULL THEN ps.course_id 
      ELSE s.course_id 
    END
    LEFT JOIN exam_attempts ea ON ea.proctor_session_id = ps.id AND ea.submitted_at IS NOT NULL
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ps.id DESC
    LIMIT 200
  `;

  const rows = await db.all(sql, params);
  return res.json({ sessions: rows || [] });
});

// Admin: session details (events + snapshots + linked attempt)
router.get('/admin/proctor/sessions/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const id = parseInt(req.params.id, 10);

  const sess = await db.get(
    `SELECT ps.id AS "sessionId", ps.status, ps.mode, ps.started_at AS "startedAt", ps.ended_at AS "endedAt",
            ps.warning_count AS "warningCount", ps.events_count AS "eventsCount", ps.snapshots_count AS "snapshotsCount",
            ps.suspicious_score AS "suspiciousScore", ps.review_status AS "reviewStatus", ps.review_notes AS "reviewNotes",
            ps.ip_address AS "ipAddress", ps.user_agent AS "userAgent", ps.fingerprint,
            ps.screenshare_enabled AS "screenshareEnabled",
            u.id AS "userId", u.email AS "studentEmail", u.name AS "studentName",
            s.id AS "subjectId", s.name AS "subjectName",
            c.id AS "courseId", c.title AS "courseTitle"
     FROM exam_proctor_sessions ps
     JOIN users u ON u.id = ps.user_id
     LEFT JOIN subjects s ON s.id = ps.subject_id
     LEFT JOIN courses c ON c.id = CASE 
       WHEN ps.course_id IS NOT NULL THEN ps.course_id 
       ELSE s.course_id 
     END
     WHERE ps.id=?`,
    [id]
  );
  if (!sess) return res.status(404).json({ error: 'Session not found' });

  const events = await db.all(
    `SELECT id, event_type AS "eventType", meta, created_at AS "createdAt"
     FROM exam_proctor_events WHERE session_id=? ORDER BY id ASC`,
    [id]
  );

  const snapshots = await db.all(
    `SELECT id, file_path AS "filePath", snapshot_type AS "snapshotType", created_at AS "createdAt"
     FROM exam_proctor_snapshots WHERE session_id=? ORDER BY id DESC`,
    [id]
  );

  const attempt = await db.get(
    `SELECT id AS "attemptId", attempt_no AS "attemptNo", score_percent AS "scorePercent", passed,
            submitted_at AS "submittedAt", result_release_at AS "resultReleaseAt"
     FROM exam_attempts WHERE proctor_session_id=? ORDER BY id DESC LIMIT 1`,
    [id]
  );

  return res.json({ session: sess, events: events || [], snapshots: snapshots || [], attempt: attempt || null });
});

// Admin: mark session review
router.post('/admin/proctor/sessions/:id/review', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const id = parseInt(req.params.id, 10);
  const reviewStatus = (req.body?.reviewStatus || '').toString().trim().toUpperCase();
  const reviewNotes = (req.body?.reviewNotes || '').toString();

  const allowed = new Set(['PENDING', 'CLEARED', 'FLAGGED']);
  if (!allowed.has(reviewStatus)) return res.status(400).json({ error: 'Invalid reviewStatus' });

  await db.run(
    `UPDATE exam_proctor_sessions SET review_status=?, review_notes=? WHERE id=?`,
    [reviewStatus, reviewNotes || null, id]
  );

  return res.json({ ok: true });
});

module.exports = router;
