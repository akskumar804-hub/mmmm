const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowIso, randomEnrollmentNo, randomCertificateNo } = require('../utils/helpers');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : '';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Student: apply/enroll in course
router.post('/student/enrollments', requireAuth, requireRole('student'), async (req, res) => {
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const db = await getDb();
  const course = await db.get('SELECT id,title FROM courses WHERE id=?', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const ts = nowIso();
  try {
    await db.run(
      `INSERT INTO enrollments (user_id, course_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?)`,
      [req.user.id, courseId, 'APPLIED', ts, ts]
    );
  } catch (e) {
    // likely already enrolled
  }

  // Email (best-effort)
  await sendEmail({
    to: req.user.email,
    subject: 'Course application received',
    text: `We received your application for ${course.title}. Please complete your profile & upload documents.`,
    html: `<p>We received your application for <strong>${course.title}</strong>.</p><p>Please complete your profile & upload documents.</p>`
  });

  return res.json({ ok: true });
});

// Student: list enrollments
router.get('/student/enrollments', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const enrollments = await db.all(
    `SELECT e.id, e.status, e.enrollment_no AS "enrollmentNo", e.receipt_path AS "receiptPath",
            e.payment_confirmed_at AS "paymentConfirmedAt", e.completed_at AS "completedAt",
            c.id AS "courseId", c.title AS "courseTitle", c.code AS "courseCode",
            c.admission_fee AS "admissionFee", c.tuition_fee AS "tuitionFee", c.duration, c.level
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = ?
     ORDER BY e.id DESC`,
    [req.user.id]
  );
  return res.json({ enrollments });
});

// Student: upload payment receipt
router.post(
  '/student/enrollments/:id/upload-receipt',
  requireAuth,
  requireRole('student'),
  upload.single('receipt'),
  async (req, res) => {
    const db = await getDb();
    const enr = await db.get('SELECT id,status,course_id FROM enrollments WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!enr) return res.status(404).json({ error: 'Enrollment not found' });

    if (!req.file) return res.status(400).json({ error: 'receipt file required' });

    const ts = nowIso();
    const rel = `/uploads/${req.file.filename}`;

    // Only allow receipt upload after profile approval (PAYMENT_PENDING) or after rejection (PAYMENT_REJECTED)
    if (!['PAYMENT_PENDING', 'RECEIPT_UPLOADED', 'PAYMENT_REJECTED'].includes(enr.status)) {
      return res.status(400).json({ error: `Receipt upload not allowed in status ${enr.status}. Ask admin to approve your profile.` });
    }

    await db.run(
      `UPDATE enrollments SET receipt_path=?, status='RECEIPT_UPLOADED', updated_at=? WHERE id=?`,
      [rel, ts, enr.id]
    );

    await sendEmail({
      to: req.user.email,
      subject: 'Payment receipt uploaded',
      text: `Your payment receipt was uploaded successfully. Admin will confirm payment soon.`,
      html: `<p>Your payment receipt was uploaded successfully.</p><p>Admin will confirm payment soon.</p>`
    });

    return res.json({ ok: true, receiptPath: rel });
  }
);

// Admin: list enrollments (optional status filter)
router.get('/admin/enrollments', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const status = req.query.status;
  const where = status ? 'WHERE e.status = ?' : '';
  const params = status ? [status] : [];
  const rows = await db.all(
    `SELECT e.id, e.status, e.receipt_path AS "receiptPath", e.enrollment_no AS "enrollmentNo", e.created_at AS "createdAt",
            u.id AS "studentId", u.email AS "studentEmail", u.name AS "studentName",
            c.id AS "courseId", c.title AS "courseTitle", c.code AS "courseCode",
            c.admission_fee AS "admissionFee", c.tuition_fee AS "tuitionFee"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     ${where}
     ORDER BY e.id DESC`,
    params
  );

  // Fetch exam attempts and results for each enrollment
  const enrichedRows = await Promise.all(rows.map(async (enrollment) => {
    // Get all SUBMITTED exam attempts for this student in this course
    // Only show attempts that have been submitted (submitted_at IS NOT NULL)
    const attempts = await db.all(
      `SELECT 
        c2.id AS "courseId", c2.title AS "courseName",
        a.id AS "attemptId", a.attempt_no AS "attemptNo", 
        a.score_percent AS "scorePercent", a.passed, 
        a.submitted_at AS "submittedAt", a.evaluated_at AS "evaluatedAt",
        a.result_release_at AS "resultReleaseAt"
       FROM exam_attempts a
       JOIN courses c2 ON c2.id = a.course_id
       WHERE a.user_id = ? AND a.course_id = ? AND a.submitted_at IS NOT NULL
       ORDER BY a.attempt_no DESC`,
      [enrollment.studentId, enrollment.courseId]
    );

    // Get the latest submitted attempt (for summary)
    const latestAttempts = attempts.length > 0 ? [attempts[0]] : [];

    // Count total attempts and passed attempts
    const totalAttempts = attempts.length;
    const passedAttempts = attempts.filter(a => a.passed).length;

    return {
      ...enrollment,
      examAttempts: totalAttempts,
      examPassed: passedAttempts,
      latestExamResults: latestAttempts // detailed results per subject
    };
  }));

  return res.json({ enrollments: enrichedRows });
});

// Admin: confirm payment (generates enrollment number)
router.post('/admin/enrollments/:id/confirm-payment', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const enr = await db.get(
    `SELECT e.id, e.status, e.course_id AS "courseId", e.user_id AS "userId",
            u.email AS "studentEmail", u.name AS "studentName",
            c.code AS "courseCode", c.title AS "courseTitle"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = ?`,
    [req.params.id]
  );
  if (!enr) return res.status(404).json({ error: 'Enrollment not found' });

  if (!['RECEIPT_UPLOADED'].includes(enr.status)) {
    return res.status(400).json({ error: `Cannot confirm payment in status ${enr.status}` });
  }

  const ts = nowIso();
  const enrollmentNo = randomEnrollmentNo(enr.courseTitle, enr.id);

  await db.run(
    `UPDATE enrollments SET status='PAID', enrollment_no=?, payment_confirmed_at=?, updated_at=? WHERE id=?`,
    [enrollmentNo, ts, ts, enr.id]
  );

  await sendEmail({
    to: enr.studentEmail,
    subject: 'Payment confirmed - Enrollment number issued',
    text: `Payment confirmed for ${enr.courseTitle}. Your Enrollment No: ${enrollmentNo}`,
    html: `<p>Payment confirmed for <strong>${enr.courseTitle}</strong>.</p><p>Your Enrollment No: <strong>${enrollmentNo}</strong></p>`
  });

  return res.json({ ok: true, enrollmentNo });
});

// Admin: reject payment
router.post('/admin/enrollments/:id/reject-payment', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const { reason } = req.body || {};
  const enr = await db.get(
    `SELECT e.id, e.status, e.course_id AS "courseId", e.user_id AS "userId",
            u.email AS "studentEmail", u.name AS "studentName",
            c.title AS "courseTitle"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = ?`,
    [req.params.id]
  );
  if (!enr) return res.status(404).json({ error: 'Enrollment not found' });

  if (!['RECEIPT_UPLOADED', 'PAYMENT_PENDING'].includes(enr.status)) {
    return res.status(400).json({ error: `Cannot reject payment in status ${enr.status}` });
  }

  const ts = nowIso();
  await db.run(
    `UPDATE enrollments SET status='PAYMENT_REJECTED', updated_at=? WHERE id=?`,
    [ts, enr.id]
  );

  const reasonText = reason ? `\n\nReason: ${reason}` : '';
  await sendEmail({
    to: enr.studentEmail,
    subject: 'Payment Rejected - Enrollment Status',
    text: `Your payment for ${enr.courseTitle} has been rejected.${reasonText}\n\nPlease contact admin for more information.`,
    html: `<p>Your payment for <strong>${enr.courseTitle}</strong> has been rejected.${reasonText ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}<p>Please contact admin for more information.</p>`
  }).catch(() => {});

  return res.json({ ok: true });
});

// Admin: mark course completed + issue certificate
router.post('/admin/enrollments/:id/mark-completed', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const enr = await db.get(
    `SELECT e.id, e.status, e.course_id AS "courseId", e.user_id AS "userId", e.enrollment_no AS "enrollmentNo",
            u.email AS "studentEmail", u.name AS "studentName",
            c.code AS "courseCode", c.title AS "courseTitle"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = ?`,
    [req.params.id]
  );
  if (!enr) return res.status(404).json({ error: 'Enrollment not found' });

  if (!['PAID', 'ACTIVE', 'COMPLETED'].includes(enr.status)) {
    return res.status(400).json({ error: `Cannot complete in status ${enr.status}` });
  }

  const ts = nowIso();
  await db.run(`UPDATE enrollments SET status='COMPLETED', completed_at=?, updated_at=? WHERE id=?`, [ts, ts, enr.id]);

  // Issue certificate (idempotent)
  const existing = await db.get('SELECT certificate_no AS "certificateNo" FROM certificates WHERE user_id=? AND course_id=?', [enr.userId, enr.courseId]);
  let certificateNo = existing?.certificateNo;
  if (!certificateNo) {
    certificateNo = randomCertificateNo(enr.courseCode);
    await db.run(
      `INSERT INTO certificates (user_id, course_id, certificate_no, issued_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?)`,
      [enr.userId, enr.courseId, certificateNo, ts, ts, ts]
    );
  }

  await sendEmail({
    to: enr.studentEmail,
    subject: 'Course completed - Certificate issued',
    text: `Congratulations! You have completed ${enr.courseTitle}. Certificate No: ${certificateNo}`,
    html: `<p>Congratulations! You have completed <strong>${enr.courseTitle}</strong>.</p><p>Certificate No: <strong>${certificateNo}</strong></p>`
  });

  return res.json({ ok: true, certificateNo });
});

module.exports = router;
