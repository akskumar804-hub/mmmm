const express = require('express');
const crypto = require('crypto');

const Razorpay = require('razorpay');

const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowIso, randomEnrollmentNo } = require('../utils/helpers');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

function razor() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

async function totalFeeForCourse(db, courseId) {
  const c = await db.get('SELECT admission_fee AS "admissionFee", tuition_fee AS "tuitionFee" FROM courses WHERE id=?', [courseId]);
  if (!c) return null;
  const admission = Number(c.admissionFee ?? 3000);
  const tuition = Number(c.tuitionFee ?? 0);
  return { amountRupees: admission + tuition, admission, tuition };
}

// Student: create Razorpay order
router.post('/student/enrollments/:id/razorpay/order', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const enrollmentId = Number(req.params.id);

  const enr = await db.get(
    `SELECT e.id, e.status, e.course_id AS "courseId", e.user_id AS "userId",
            u.email AS "studentEmail", u.name AS "studentName",
            c.code AS "courseCode", c.title AS "courseTitle"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.id=? AND e.user_id=?`,
    [enrollmentId, req.user.id]
  );
  if (!enr) return res.status(404).json({ error: 'Enrollment not found' });

  // Allow payment once admin approved profile OR receipt flow is enabled
  if (!['PAYMENT_PENDING', 'RECEIPT_UPLOADED', 'APPLIED', 'PROFILE_APPROVED'].includes(enr.status)) {
    // For safety, still allow if status already PAID
    if (['PAID', 'ACTIVE', 'COMPLETED'].includes(enr.status)) {
      return res.status(400).json({ error: 'Payment already confirmed.' });
    }
    return res.status(400).json({ error: `Cannot start payment in status ${enr.status}. Ask admin to approve your profile.` });
  }

  const client = razor();
  if (!client) return res.status(400).json({ error: 'Razorpay not configured on server (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET).' });

  const fee = await totalFeeForCourse(db, enr.courseId);
  if (!fee) return res.status(404).json({ error: 'Course not found' });

  const ts = nowIso();
  const amountPaise = Math.round(fee.amountRupees * 100);

  const order = await client.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: `enr_${enrollmentId}`,
    notes: { enrollmentId: String(enrollmentId), courseId: String(enr.courseId), userId: String(req.user.id) }
  });

  // Save payment record
  await db.run(
    `INSERT INTO payments (enrollment_id, provider, order_id, amount, currency, status, created_at, updated_at)
     VALUES (?,?,?,?,?,'CREATED',?,?)`,
    [enrollmentId, 'razorpay', order.id, amountPaise, 'INR', ts, ts]
  );

  await db.run(
    `UPDATE enrollments
     SET payment_provider='razorpay', payment_status='CREATED', amount_paid=?, currency='INR', payment_order_id=?, updated_at=?
     WHERE id=?`,
    [amountPaise, order.id, ts, enrollmentId]
  );

  return res.json({
    keyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
    order,
    amountPaise,
    courseTitle: enr.courseTitle,
    studentName: enr.studentName,
    studentEmail: enr.studentEmail
  });
});

// Student: verify Razorpay payment
router.post('/student/enrollments/:id/razorpay/verify', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const enrollmentId = Number(req.params.id);

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing Razorpay verification fields' });
  }

  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keySecret) return res.status(400).json({ error: 'Razorpay not configured on server' });

  const enr = await db.get(
    `SELECT e.id, e.status, e.course_id AS "courseId", e.user_id AS "userId", e.enrollment_no AS "enrollmentNo",
            u.email AS "studentEmail", u.name AS "studentName",
            c.code AS "courseCode", c.title AS "courseTitle"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.id=? AND e.user_id=?`,
    [enrollmentId, req.user.id]
  );
  if (!enr) return res.status(404).json({ error: 'Enrollment not found' });

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const ts = nowIso();

  if (expected !== razorpay_signature) {
    await db.run(
      `UPDATE payments SET status='FAILED', payment_id=?, signature=?, updated_at=?
       WHERE enrollment_id=? AND provider='razorpay' AND order_id=?`,
      [razorpay_payment_id, razorpay_signature, ts, enrollmentId, razorpay_order_id]
    );
    await db.run(
      `UPDATE enrollments SET payment_status='FAILED', payment_payment_id=?, payment_signature=?, updated_at=? WHERE id=?`,
      [razorpay_payment_id, razorpay_signature, ts, enrollmentId]
    );
    return res.status(400).json({ error: 'Signature verification failed' });
  }

  // Mark payment success
  await db.run(
    `UPDATE payments SET status='PAID', payment_id=?, signature=?, updated_at=?
     WHERE enrollment_id=? AND provider='razorpay' AND order_id=?`,
    [razorpay_payment_id, razorpay_signature, ts, enrollmentId, razorpay_order_id]
  );

  // Generate enrollment no if missing
  let enrollmentNo = enr.enrollmentNo;
  if (!enrollmentNo) enrollmentNo = randomEnrollmentNo(enr.courseCode, enrollmentId);

  await db.run(
    `UPDATE enrollments
     SET status='PAID', enrollment_no=?, payment_confirmed_at=?, payment_status='PAID', payment_order_id=?, payment_payment_id=?, payment_signature=?, updated_at=?
     WHERE id=?`,
    [enrollmentNo, ts, razorpay_order_id, razorpay_payment_id, razorpay_signature, ts, enrollmentId]
  );

  await sendEmail({
    to: enr.studentEmail,
    subject: 'Payment confirmed - Enrollment number issued',
    text: `Payment confirmed for ${enr.courseTitle}. Your Enrollment No: ${enrollmentNo}`,
    html: `<p>Payment confirmed for <strong>${enr.courseTitle}</strong>.</p><p>Your Enrollment No: <strong>${enrollmentNo}</strong></p>`
  });

  return res.json({ ok: true, enrollmentNo });
});

module.exports = router;
