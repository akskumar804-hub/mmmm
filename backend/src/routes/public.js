const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Student: certificates
router.get('/student/certificates', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const certs = await db.all(
    `SELECT cert.certificate_no AS "certificateNo", cert.issued_at AS "issuedAt",
            c.title AS "courseTitle", c.code AS "courseCode"
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     WHERE cert.user_id = ?
     ORDER BY cert.id DESC`,
    [req.user.id]
  );
  return res.json({ certificates: certs });
});

// Admin: certificates
router.get('/admin/certificates', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const certs = await db.all(
    `SELECT cert.certificate_no AS "certificateNo", cert.issued_at AS "issuedAt",
            c.title AS "courseTitle", u.email AS "studentEmail", u.name AS "studentName"
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     JOIN users u ON u.id = cert.user_id
     ORDER BY cert.id DESC`
  );
  return res.json({ certificates: certs });
});

// Public verification by enrollmentNo + DOB
router.get('/verify', async (req, res) => {
  const enrollmentNo = (req.query.enrollmentNo || '').trim();
  const dob = (req.query.dob || '').trim();

  if (!enrollmentNo || !dob) return res.status(400).json({ error: 'enrollmentNo and dob are required' });

  const db = await getDb();
  const row = await db.get(
    `SELECT e.enrollment_no AS "enrollmentNo", e.status, e.completed_at AS "completedAt",
            u.name AS "studentName", u.dob AS dob, u.photo_path AS "photoPath", u.email AS email,
            c.title AS "courseTitle", c.code AS "courseCode",
            cert.certificate_no AS "certificateNo", cert.issued_at AS "issuedAt"
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN certificates cert ON cert.user_id = e.user_id AND cert.course_id = e.course_id
     WHERE e.enrollment_no = ?`,
    [enrollmentNo]
  );

  if (!row) return res.status(404).json({ error: 'Not found' });
  if ((row.dob || '').trim() !== dob) return res.status(404).json({ error: 'Not found' });

  // Only show completion details if course completed
  const isCompleted = row.status === 'COMPLETED' || !!row.certificateNo;

  return res.json({
    found: true,
    enrollmentNo: row.enrollmentNo,
    studentName: row.studentName,
    courseTitle: row.courseTitle,
    courseCode: row.courseCode,
    photoPath: row.photoPath,
    status: row.status,
    completed: isCompleted,
    completedAt: row.completedAt,
    certificateNo: row.certificateNo,
    issuedAt: row.issuedAt
  });
});

module.exports = router;
