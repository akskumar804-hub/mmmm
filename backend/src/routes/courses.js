const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowIso } = require('../utils/helpers');

const router = express.Router();

// Public: list courses
router.get('/courses', async (req, res) => {
  const db = await getDb();
  const courses = await db.all(
    `SELECT id, code, title, short_description AS "shortDescription", description, level, duration,
            admission_fee AS "admissionFee", tuition_fee AS "tuitionFee"
     FROM courses ORDER BY id DESC`
  );
  return res.json({ courses });
});

// Public: course detail + subjects
router.get('/courses/:id', async (req, res) => {
  const db = await getDb();
  const course = await db.get(
    `SELECT id, code, title, short_description AS "shortDescription", description, level, duration,
            admission_fee AS "admissionFee", tuition_fee AS "tuitionFee", content_json AS "contentJson"
     FROM courses WHERE id = ?`,
    [req.params.id]
  );
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const subjects = await db.all(
    `SELECT id, name, semester, passing_score AS "passingScore", total_marks AS "totalMarks"
     FROM subjects WHERE course_id = ? ORDER BY id ASC`,
    [course.id]
  );

  return res.json({ course: { ...course, subjects } });
});

// Admin: list courses (same)
router.get('/admin/courses', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const courses = await db.all(
    `SELECT id, code, title, short_description AS "shortDescription", description, level, duration,
            admission_fee AS "admissionFee", tuition_fee AS "tuitionFee"
     FROM courses ORDER BY id DESC`
  );
  return res.json({ courses });
});

// Admin: get single course
router.get('/admin/courses/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const course = await db.get(
    `SELECT id, code, title, short_description AS "shortDescription", description, level, duration,
            admission_fee AS "admissionFee", tuition_fee AS "tuitionFee", content_json AS "contentJson"
     FROM courses WHERE id = ?`,
    [req.params.id]
  );
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const subjects = await db.all(
    `SELECT id, name, semester, passing_score AS "passingScore", total_marks AS "totalMarks"
     FROM subjects WHERE course_id = ? ORDER BY id ASC`,
    [course.id]
  );

  return res.json({ course: { ...course, subjects } });
});

router.post(
  '/admin/courses',
  requireAuth,
  requireRole('admin'),
  body('title').isLength({ min: 2 }).trim(),
  body('tuitionFee').isInt({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const { code, title, shortDescription, description, level, duration, tuitionFee, contentJson } = req.body;
    const db = await getDb();
    const ts = nowIso();
    const result = await db.run(
      `INSERT INTO courses (code,title,short_description,description,level,duration,admission_fee,tuition_fee,content_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,3000,?,?,?,?)`,
      [code || null, title, shortDescription || null, description || null, level || null, duration || null, tuitionFee, contentJson ? JSON.stringify(contentJson) : null, ts, ts]
    );
    const course = await db.get('SELECT * FROM courses WHERE id = ?', [result.lastID]);
    return res.json({ course });
  }
);

router.put(
  '/admin/courses/:id',
  requireAuth,
  requireRole('admin'),
  body('title').optional().isLength({ min: 2 }).trim(),
  body('tuitionFee').optional().isInt({ min: 0 }),
  async (req, res) => {
    const db = await getDb();
    const existing = await db.get('SELECT id FROM courses WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Course not found' });

    const patch = req.body || {};
    const ts = nowIso();
    await db.run(
      `UPDATE courses SET
        code = COALESCE(?, code),
        title = COALESCE(?, title),
        short_description = COALESCE(?, short_description),
        description = COALESCE(?, description),
        level = COALESCE(?, level),
        duration = COALESCE(?, duration),
        tuition_fee = COALESCE(?, tuition_fee),
        content_json = COALESCE(?, content_json),
        updated_at = ?
       WHERE id = ?`,
      [
        patch.code ?? null,
        patch.title ?? null,
        patch.shortDescription ?? null,
        patch.description ?? null,
        patch.level ?? null,
        patch.duration ?? null,
        patch.tuitionFee ?? null,
        patch.contentJson ? JSON.stringify(patch.contentJson) : null,
        ts,
        req.params.id
      ]
    );
    const course = await db.get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
    return res.json({ course });
  }
);

router.delete('/admin/courses/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM courses WHERE id = ?', [req.params.id]);
  return res.json({ ok: true });
});

// Admin: get subjects for a course
router.get('/admin/courses/:id/subjects', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const course = await db.get('SELECT id FROM courses WHERE id = ?', [req.params.id]);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const subjects = await db.all(
    `SELECT id, name, semester, passing_score AS "passingScore", total_marks AS "totalMarks", created_at AS "createdAt"
     FROM subjects WHERE course_id = ? ORDER BY id ASC`,
    [req.params.id]
  );
  return res.json({ subjects });
});

// Admin: add subject
router.post(
  '/admin/courses/:id/subjects',
  requireAuth,
  requireRole('admin'),
  body('name').isLength({ min: 2 }).trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    const db = await getDb();
    const course = await db.get('SELECT id FROM courses WHERE id = ?', [req.params.id]);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const ts = nowIso();
    const { name, semester, passingScore, totalMarks } = req.body;
    const result = await db.run(
      `INSERT INTO subjects (course_id,name,semester,passing_score,total_marks,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [req.params.id, name, semester || null, passingScore ?? 40, totalMarks ?? 100, ts, ts]
    );
    const subject = await db.get('SELECT * FROM subjects WHERE id = ?', [result.lastID]);
    return res.json({ subject });
  }
);

module.exports = router;
