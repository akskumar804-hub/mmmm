const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowIso } = require('../utils/helpers');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : '';
    const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

// Student: get own profile
router.get('/student/profile', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const u = await db.get(
    `SELECT id, role, email, name, dob, phone, latest_education AS "latestEducation",
            photo_path AS "photoPath", id_card_path AS "idCardPath", edu_doc_path AS "eduDocPath",
            is_profile_verified AS "isProfileVerified"
     FROM users WHERE id = ?`,
    [req.user.id]
  );
  return res.json({ profile: u });
});

// Student: update profile fields
router.put('/student/profile', requireAuth, requireRole('student'), async (req, res) => {
  const { name, dob, phone, latestEducation } = req.body || {};
  const db = await getDb();
  const ts = nowIso();

  await db.run(
    `UPDATE users SET
      name = COALESCE(?, name),
      dob = COALESCE(?, dob),
      phone = COALESCE(?, phone),
      latest_education = COALESCE(?, latest_education),
      updated_at = ?
     WHERE id = ?`,
    [name ?? null, dob ?? null, phone ?? null, latestEducation ?? null, ts, req.user.id]
  );

  return res.json({ ok: true });
});

// Student: upload profile docs
router.post(
  '/student/profile/upload',
  requireAuth,
  requireRole('student'),
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'idCard', maxCount: 1 },
    { name: 'eduDoc', maxCount: 1 }
  ]),
  async (req, res) => {
    const db = await getDb();
    const ts = nowIso();

    const photo = req.files?.photo?.[0];
    const idCard = req.files?.idCard?.[0];
    const eduDoc = req.files?.eduDoc?.[0];

    const photoRel = photo ? `/uploads/${photo.filename}` : null;
    const idRel = idCard ? `/uploads/${idCard.filename}` : null;
    const eduRel = eduDoc ? `/uploads/${eduDoc.filename}` : null;

    await db.run(
      `UPDATE users SET
        photo_path = COALESCE(?, photo_path),
        id_card_path = COALESCE(?, id_card_path),
        edu_doc_path = COALESCE(?, edu_doc_path),
        updated_at = ?
       WHERE id = ?`,
      [photoRel, idRel, eduRel, ts, req.user.id]
    );

    // If student has enrollments in APPLIED or PROFILE_REJECTED, mark profile submitted
    await db.run(
      `UPDATE enrollments SET status='PROFILE_SUBMITTED', updated_at=? WHERE user_id=? AND status IN ('APPLIED', 'PROFILE_REJECTED')`,
      [ts, req.user.id]
    );

    return res.json({ ok: true, uploaded: { photo: !!photo, idCard: !!idCard, eduDoc: !!eduDoc } });
  }
);

// Admin: list students
router.get('/admin/students', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const students = await db.all(
    `SELECT id, email, name, phone, dob, latest_education AS "latestEducation",
            is_profile_verified AS "isProfileVerified",
            photo_path AS "photoPath", id_card_path AS "idCardPath", edu_doc_path AS "eduDocPath"
     FROM users WHERE role='student' ORDER BY id DESC`
  );
  return res.json({ students });
});

// Admin: approve student profile
router.post('/admin/students/:id/approve-profile', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const student = await db.get('SELECT email, name FROM users WHERE id=? AND role=?', [req.params.id, 'student']);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const ts = nowIso();
  await db.run(`UPDATE users SET is_profile_verified=1, updated_at=? WHERE id=? AND role='student'`, [ts, req.params.id]);

  // Move enrollments forward
  await db.run(
    `UPDATE enrollments
     SET status='PAYMENT_PENDING', updated_at=?
     WHERE user_id=? AND status IN ('PROFILE_SUBMITTED','APPLIED','PROFILE_APPROVED')`,
    [ts, req.params.id]
  );

  // Send approval email to student
  await sendEmail({
    to: student.email,
    subject: 'Profile Approved - Enrollment Next Steps',
    text: `Your profile has been approved. You can now upload payment receipt or proceed with payment to complete your enrollment.`,
    html: `<p>Hello ${student.name},</p><p>Your profile has been approved successfully.</p><p>You can now upload your payment receipt or proceed with payment to complete your enrollment.</p>`
  }).catch(() => {});

  return res.json({ ok: true });
});

// Admin: reject student profile
router.post('/admin/students/:id/reject-profile', requireAuth, requireRole('admin'), async (req, res) => {
  const { reason } = req.body || {};
  const db = await getDb();
  const student = await db.get('SELECT email, name FROM users WHERE id=? AND role=?', [req.params.id, 'student']);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const ts = nowIso();
  
  // Update enrollments to REJECTED
  await db.run(
    `UPDATE enrollments
     SET status='REJECTED', updated_at=?
     WHERE user_id=? AND status IN ('PROFILE_SUBMITTED','APPLIED','PROFILE_APPROVED','PROFILE_REJECTED')`,
    [ts, req.params.id]
  );

  // Send rejection email to student
  const reasonText = reason ? `\n\nReason: ${reason}` : '';
  await sendEmail({
    to: student.email,
    subject: 'Enrollment Application - Profile Rejected',
    text: `Your profile has been rejected and your enrollment application cannot proceed at this time.${reasonText}\n\nPlease contact admin for more information.`,
    html: `<p>Hello ${student.name},</p><p>Your profile has been rejected and your enrollment application cannot proceed at this time.${reasonText ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}<p>Please contact admin for more information.</p>`
  }).catch(() => {});

  return res.json({ ok: true });
});

module.exports = router;
