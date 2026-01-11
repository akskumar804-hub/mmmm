const express = require('express');
const { stringify } = require('csv-stringify/sync');

const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Admin: high-level summary
router.get('/admin/analytics/summary', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  const students = await db.get("SELECT COUNT(*) AS c FROM users WHERE role='student'");
  const enrollments = await db.get('SELECT COUNT(*) AS c FROM enrollments');
  const paidEnrollments = await db.get("SELECT COUNT(*) AS c FROM enrollments WHERE status IN ('PAID','ACTIVE','COMPLETED')");
  const completedEnrollments = await db.get("SELECT COUNT(*) AS c FROM enrollments WHERE status='COMPLETED'");
  const attempts = await db.get('SELECT COUNT(*) AS c FROM exam_attempts');
  const pendingResults = await db.get(
    "SELECT COUNT(*) AS c FROM exam_attempts WHERE evaluated_at IS NOT NULL AND result_release_at > NOW()"
  );

  // Average completion across all course_progress rows
  const avgCompletion = await db.get('SELECT COALESCE(ROUND(AVG(completion_percent)),0) AS v FROM course_progress');

  res.json({
    students: students?.c || 0,
    enrollments: enrollments?.c || 0,
    paidEnrollments: paidEnrollments?.c || 0,
    completedEnrollments: completedEnrollments?.c || 0,
    attempts: attempts?.c || 0,
    pendingResults: pendingResults?.c || 0,
    avgCompletion: avgCompletion?.v || 0
  });
});

// Admin: student activity + progress snapshot
router.get('/admin/analytics/students', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();

  const rows = await db.all(
    `SELECT u.id, u.name, u.email,
            COALESCE(MAX(cp.last_activity_at), NULL) AS "lastActivityAt",
            COALESCE(ROUND(AVG(cp.completion_percent)),0) AS "avgCompletion",
            COALESCE(SUM(cp.time_spent_seconds),0) AS "timeSpentSeconds",
            COALESCE(COUNT(DISTINCT e.id),0) AS "enrollmentsCount"
     FROM users u
     LEFT JOIN enrollments e ON e.user_id = u.id
     LEFT JOIN course_progress cp ON cp.user_id = u.id
     WHERE u.role='student'
     GROUP BY u.id
     ORDER BY "lastActivityAt" IS NULL ASC, "lastActivityAt" DESC, u.id DESC
     LIMIT 500`
  );

  res.json({ students: rows });
});

// ---------------- Exports ----------------
function sendCsv(res, filename, records) {
  const csv = stringify(records, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get('/admin/exports/enrollments.csv', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  const rows = await db.all(
    `SELECT e.id, e.status, e.enrollment_no AS "enrollmentNo", e.created_at AS "createdAt",
            u.name AS "studentName", u.email AS "studentEmail",
            c.title AS "courseTitle", c.code AS "courseCode",
            c.admission_fee AS "admissionFee", c.tuition_fee AS "tuitionFee",
            e.payment_provider AS "paymentProvider", e.payment_status AS "paymentStatus"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     ORDER BY e.id DESC`
  );
  return sendCsv(res, 'enrollments.csv', rows);
});

router.get('/admin/exports/exams.csv', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  const rows = await db.all(
    `SELECT a.id, a.attempt_no AS "attemptNo", a.started_at AS "startedAt", a.submitted_at AS "submittedAt",
            a.evaluated_at AS "evaluatedAt", a.result_release_at AS "resultReleaseAt",
            a.score_percent AS "scorePercent", a.passed, a.cooldown_until AS "cooldownUntil",
            u.name AS "studentName", u.email AS "studentEmail",
            s.name AS "subjectName",
            c.title AS "courseTitle"
     FROM exam_attempts a
     JOIN users u ON u.id = a.user_id
     JOIN subjects s ON s.id = a.subject_id
     JOIN courses c ON c.id = s.course_id
     ORDER BY a.id DESC`
  );
  return sendCsv(res, 'exam_attempts.csv', rows);
});

router.get('/admin/exports/progress.csv', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  const rows = await db.all(
    `SELECT cp.id, u.name AS "studentName", u.email AS "studentEmail",
            c.title AS "courseTitle", cp.completion_percent AS "completionPercent",
            cp.completed_lessons AS "completedLessons", cp.total_lessons AS "totalLessons",
            cp.time_spent_seconds AS "timeSpentSeconds", cp.status,
            cp.last_activity_at AS "lastActivityAt", cp.completed_at AS "completedAt"
     FROM course_progress cp
     JOIN users u ON u.id = cp.user_id
     JOIN courses c ON c.id = cp.course_id
     ORDER BY cp.last_activity_at IS NULL ASC, cp.last_activity_at DESC, cp.id DESC`
  );
  return sendCsv(res, 'course_progress.csv', rows);
});

// JSON exports
router.get('/admin/exports/enrollments.json', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  const rows = await db.all(
    `SELECT e.*, u.name AS student_name, u.email AS student_email, c.title AS course_title, c.code AS course_code
     FROM enrollments e JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id
     ORDER BY e.id DESC`
  );
  res.json({ enrollments: rows });
});

router.get('/admin/exports/exams.json', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  const rows = await db.all(
    `SELECT a.*, u.name AS student_name, u.email AS student_email, s.name AS subject_name, c.title AS course_title
     FROM exam_attempts a JOIN users u ON u.id=a.user_id JOIN subjects s ON s.id=a.subject_id JOIN courses c ON c.id=s.course_id
     ORDER BY a.id DESC`
  );
  res.json({ attempts: rows });
});

router.get('/admin/exports/progress.json', requireAuth, requireRole('admin'), async (_req, res) => {
  const db = await getDb();
  const rows = await db.all(
    `SELECT cp.*, u.name AS student_name, u.email AS student_email, c.title AS course_title
     FROM course_progress cp JOIN users u ON u.id=cp.user_id JOIN courses c ON c.id=cp.course_id
     ORDER BY cp.id DESC`
  );
  res.json({ progress: rows });
});

module.exports = router;
