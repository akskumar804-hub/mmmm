const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowIso } = require('../utils/helpers');
const { computeAndUpsertCourseProgress, isCourseContentCompleted } = require('../utils/progress');
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

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

async function getEnrollmentForCourse(db, userId, courseId) {
  return db.get(
    `SELECT id, status, enrollment_no AS "enrollmentNo", exam_eligibility_email_sent AS "examEligibilityEmailSent"
     FROM enrollments WHERE user_id=? AND course_id=?`,
    [userId, courseId]
  );
}

async function ensureLearningAccess(db, userId, courseId) {
  const enr = await getEnrollmentForCourse(db, userId, courseId);
  if (!enr) return { ok: false, reason: 'You are not enrolled in this course.' };
  if (!['PAID', 'ACTIVE', 'COMPLETED'].includes(enr.status)) {
    return { ok: false, reason: `Course is not activated yet (status: ${enr.status}). Complete profile + payment first.` };
  }
  return { ok: true, enrollment: enr };
}

async function fetchCourseContent(db, courseId, { publishedOnly }) {
  const modWhere = publishedOnly ? 'AND m.is_published = 1' : '';
  const lesWhere = publishedOnly ? 'AND l.is_published = 1' : '';

  const modules = await db.all(
    `SELECT m.id, m.course_id AS "courseId", m.title, m.description, m.position, m.is_published AS "isPublished"
     FROM course_modules m
     WHERE m.course_id = ? ${modWhere}
     ORDER BY m.position ASC, m.id ASC`,
    [courseId]
  );

  const lessons = await db.all(
    `SELECT l.id, l.module_id AS "moduleId", l.title, l.lesson_type AS "lessonType",
            l.content_text AS "contentText", l.content_url AS "contentUrl", l.position,
            l.estimated_minutes AS "estimatedMinutes", l.is_published AS "isPublished"
     FROM course_lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE m.course_id = ? ${modWhere} ${lesWhere}
     ORDER BY l.position ASC, l.id ASC`,
    [courseId]
  );

  // Attach resources for each lesson
  const lessonIds = lessons.map((l) => l.id);
  const resourceRows = lessonIds.length
    ? await db.all(
        `SELECT id, lesson_id AS "lessonId", resource_type AS "resourceType", title, url, path
         FROM lesson_resources
         WHERE lesson_id IN (${lessonIds.map(() => '?').join(',')})
         ORDER BY id ASC`,
        lessonIds
      )
    : [];

  const resByLesson = new Map();
  for (const r of resourceRows) {
    if (!resByLesson.has(r.lessonid ?? r.lessonId)) resByLesson.set(r.lessonid ?? r.lessonId, []);
    resByLesson.get(r.lessonid ?? r.lessonId).push(r);
  }

  for (const l of lessons) {
    const key = l.id;
    l.resources = resByLesson.get(key) || [];
  }

  const byModule = new Map();
  for (const m of modules) byModule.set(m.id, { ...m, lessons: [] });
  for (const l of lessons) {
    const mod = byModule.get(l.moduleId);
    if (mod) mod.lessons.push(l);
  }

  return Array.from(byModule.values());
}

// Public: course content (published only)
router.get('/courses/:courseId/content', async (req, res) => {
  const db = await getDb();
  const courseId = Number.parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) return res.status(400).json({ error: 'Invalid courseId' });
  const course = await db.get('SELECT id,title FROM courses WHERE id=?', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const modules = await fetchCourseContent(db, courseId, { publishedOnly: true });
  return res.json({ course, modules });
});

// Student: course content + progress
router.get('/student/courses/:courseId/content', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const courseId = Number.parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) return res.status(400).json({ error: 'Invalid courseId' });

  const access = await ensureLearningAccess(db, req.user.id, courseId);
  if (!access.ok) return res.status(403).json({ error: access.reason });

  const course = await db.get('SELECT id,title FROM courses WHERE id=?', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const modules = await fetchCourseContent(db, courseId, { publishedOnly: true });
  const lessonIds = modules.flatMap((m) => m.lessons.map((l) => l.id));

  const progRows = lessonIds.length
    ? await db.all(
        `SELECT lesson_id AS "lessonId", status, time_spent_seconds AS "timeSpentSeconds", last_accessed_at AS "lastAccessedAt", completed_at AS "completedAt"
         FROM lesson_progress
         WHERE user_id = ? AND lesson_id IN (${lessonIds.map(() => '?').join(',')})`,
        [req.user.id, ...lessonIds]
      )
    : [];

  const progByLesson = new Map();
  for (const p of progRows) progByLesson.set(p.lessonId, p);

  for (const mod of modules) {
    mod.lessons = mod.lessons.map((l) => ({
      ...l,
      progress: progByLesson.get(l.id) || { status: 'NOT_STARTED', timeSpentSeconds: 0, lastAccessedAt: null, completedAt: null }
    }));
  }

  const courseProgress = await computeAndUpsertCourseProgress(db, req.user.id, courseId);
  return res.json({ course, modules, courseProgress });
});

// Student: lightweight progress summary (used in dashboards)
router.get('/student/courses/:courseId/progress', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const courseId = Number.parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) return res.status(400).json({ error: 'Invalid courseId' });
  const enr = await db.get(
    `SELECT status FROM enrollments WHERE user_id=? AND course_id=?`,
    [req.user.id, courseId]
  );
  if (!enr || !['PAID','ACTIVE','COMPLETED','PAYMENT_PENDING','PROFILE_APPROVED','APPLIED','RECEIPT_UPLOADED'].includes(enr.status)) {
    return res.status(403).json({ error: 'Not enrolled in this course' });
  }
  const courseProgress = await computeAndUpsertCourseProgress(db, req.user.id, courseId);
  return res.json({ courseId, courseProgress });
});

async function ensureLessonBelongsToStudentCourse(db, userId, lessonId) {
  const row = await db.get(
    `SELECT l.id AS "lessonId", m.course_id AS "courseId"
     FROM course_lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE l.id = ?`,
    [lessonId]
  );
  if (!row) return { ok: false, reason: 'Lesson not found' };
  const access = await ensureLearningAccess(db, userId, row.courseId);
  if (!access.ok) return { ok: false, reason: access.reason };
  return { ok: true, courseId: row.courseId, enrollment: access.enrollment };
}

// Student: mark lesson started
router.post('/student/lessons/:lessonId/start', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  const chk = await ensureLessonBelongsToStudentCourse(db, req.user.id, lessonId);
  if (!chk.ok) return res.status(403).json({ error: chk.reason });

  const ts = nowIso();
  const existing = await db.get('SELECT id,status FROM lesson_progress WHERE user_id=? AND lesson_id=?', [req.user.id, lessonId]);
  if (existing?.id) {
    await db.run(
      `UPDATE lesson_progress SET status='IN_PROGRESS', last_accessed_at=?, updated_at=? WHERE id=?`,
      [ts, ts, existing.id]
    );
  } else {
    await db.run(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, time_spent_seconds, last_accessed_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.id, lessonId, 'IN_PROGRESS', 0, ts, ts, ts]
    );
  }

  const courseProgress = await computeAndUpsertCourseProgress(db, req.user.id, chk.courseId);
  return res.json({ ok: true, courseProgress });
});

// Student: heartbeat time tracking
router.post('/student/lessons/:lessonId/heartbeat', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  const deltaSeconds = Math.max(0, Math.min(300, parseInt(req.body?.deltaSeconds || '0', 10) || 0));
  if (deltaSeconds <= 0) return res.status(400).json({ error: 'deltaSeconds must be between 1 and 300' });

  const chk = await ensureLessonBelongsToStudentCourse(db, req.user.id, lessonId);
  if (!chk.ok) return res.status(403).json({ error: chk.reason });

  const ts = nowIso();
  const existing = await db.get('SELECT id FROM lesson_progress WHERE user_id=? AND lesson_id=?', [req.user.id, lessonId]);
  if (existing?.id) {
    await db.run(
      `UPDATE lesson_progress
       SET status='IN_PROGRESS', time_spent_seconds = COALESCE(time_spent_seconds,0) + ?, last_accessed_at=?, updated_at=?
       WHERE id=?`,
      [deltaSeconds, ts, ts, existing.id]
    );
  } else {
    await db.run(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, time_spent_seconds, last_accessed_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.id, lessonId, 'IN_PROGRESS', deltaSeconds, ts, ts, ts]
    );
  }

  const courseProgress = await computeAndUpsertCourseProgress(db, req.user.id, chk.courseId);
  return res.json({ ok: true, courseProgress });
});

// Student: mark lesson completed
router.post('/student/lessons/:lessonId/complete', requireAuth, requireRole('student'), async (req, res) => {
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  const chk = await ensureLessonBelongsToStudentCourse(db, req.user.id, lessonId);
  if (!chk.ok) return res.status(403).json({ error: chk.reason });

  const ts = nowIso();
  const existing = await db.get('SELECT id,status FROM lesson_progress WHERE user_id=? AND lesson_id=?', [req.user.id, lessonId]);
  if (existing?.id) {
    await db.run(
      `UPDATE lesson_progress SET status='COMPLETED', completed_at=COALESCE(completed_at,?), last_accessed_at=?, updated_at=? WHERE id=?`,
      [ts, ts, ts, existing.id]
    );
  } else {
    await db.run(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, time_spent_seconds, last_accessed_at, completed_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.user.id, lessonId, 'COMPLETED', 0, ts, ts, ts, ts]
    );
  }

  const courseProgress = await computeAndUpsertCourseProgress(db, req.user.id, chk.courseId);

  // If course content is completed, send exam eligibility email (once)
  if (courseProgress.status === 'COMPLETED') {
    const enr = await getEnrollmentForCourse(db, req.user.id, chk.courseId);
    if (enr && !enr.examEligibilityEmailSent) {
      await sendEmail({
        to: req.user.email,
        subject: 'You are now eligible for exams',
        text: `You completed the course lessons. You are now eligible to attempt exams for this course.`,
        html: `<p>You completed the course lessons.</p><p><strong>You are now eligible to attempt exams</strong> for this course.</p>`
      });
      await db.run('UPDATE enrollments SET exam_eligibility_email_sent=1, updated_at=? WHERE id=?', [ts, enr.id]);
    }
  }

  return res.json({ ok: true, courseProgress });
});

// --------------------- ADMIN: Course Builder ---------------------

// Admin: list modules+lessons for a course (including unpublished)
router.get('/admin/courses/:courseId/content', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const courseId = Number.parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) return res.status(400).json({ error: 'Invalid courseId' });
  const course = await db.get('SELECT id,title FROM courses WHERE id=?', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const modules = await fetchCourseContent(db, courseId, { publishedOnly: false });
  return res.json({ course, modules });
});

// Admin: create module
router.post('/admin/courses/:courseId/modules', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, description, isPublished } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const db = await getDb();
  const courseId = Number.parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) return res.status(400).json({ error: 'Invalid courseId' });
  const course = await db.get('SELECT id FROM courses WHERE id=?', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const max = await db.get('SELECT COALESCE(MAX(position),0) AS m FROM course_modules WHERE course_id=?', [courseId]);
  const pos = (max?.m || 0) + 1;
  const ts = nowIso();
  const r = await db.run(
    `INSERT INTO course_modules (course_id,title,description,position,is_published,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    [courseId, title, description || null, pos, isPublished === false ? 0 : 1, ts, ts]
  );
  return res.json({ ok: true, moduleId: r.lastID });
});

// Admin: update module
router.put('/admin/modules/:moduleId', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const moduleId = Number.parseInt(req.params.moduleId, 10);
  if (!Number.isInteger(moduleId)) return res.status(400).json({ error: 'Invalid moduleId' });
  const existing = await db.get('SELECT id FROM course_modules WHERE id=?', [moduleId]);
  if (!existing) return res.status(404).json({ error: 'Module not found' });

  const { title, description, isPublished } = req.body || {};
  const ts = nowIso();
  await db.run(
    `UPDATE course_modules
     SET title=COALESCE(?,title), description=COALESCE(?,description), is_published=COALESCE(?,is_published), updated_at=?
     WHERE id=?`,
    [title || null, description ?? null, typeof isPublished === 'boolean' ? (isPublished ? 1 : 0) : null, ts, moduleId]
  );
  return res.json({ ok: true });
});

// Admin: delete module
router.delete('/admin/modules/:moduleId', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const moduleId = Number.parseInt(req.params.moduleId, 10);
  if (!Number.isInteger(moduleId)) return res.status(400).json({ error: 'Invalid moduleId' });
  await db.run('DELETE FROM course_modules WHERE id=?', [moduleId]);
  return res.json({ ok: true });
});

// Admin: reorder modules
router.put('/admin/courses/:courseId/modules/reorder', requireAuth, requireRole('admin'), async (req, res) => {
  const { moduleIds } = req.body || {};
  if (!Array.isArray(moduleIds)) return res.status(400).json({ error: 'moduleIds array required' });
  const db = await getDb();
  const courseId = Number.parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) return res.status(400).json({ error: 'Invalid courseId' });

  let pos = 1;
  for (const id of moduleIds) {
    await db.run('UPDATE course_modules SET position=?, updated_at=? WHERE id=? AND course_id=?', [pos, nowIso(), Number(id), courseId]);
    pos += 1;
  }
  return res.json({ ok: true });
});

// Admin: create lesson
router.post('/admin/modules/:moduleId/lessons', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, lessonType, contentText, contentUrl, estimatedMinutes, isPublished } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!lessonType || !['text','video','pdf','link'].includes(lessonType)) return res.status(400).json({ error: 'lessonType must be text/video/pdf/link' });

  const db = await getDb();
  const moduleId = Number.parseInt(req.params.moduleId, 10);
  if (!Number.isInteger(moduleId)) return res.status(400).json({ error: 'Invalid moduleId' });
  const mod = await db.get('SELECT id FROM course_modules WHERE id=?', [moduleId]);
  if (!mod) return res.status(404).json({ error: 'Module not found' });

  const max = await db.get('SELECT COALESCE(MAX(position),0) AS m FROM course_lessons WHERE module_id=?', [moduleId]);
  const pos = (max?.m || 0) + 1;
  const ts = nowIso();
  const r = await db.run(
    `INSERT INTO course_lessons (module_id,title,lesson_type,content_text,content_url,position,estimated_minutes,is_published,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [moduleId, title, lessonType, contentText || null, contentUrl || null, pos, estimatedMinutes ? Number(estimatedMinutes) : null, isPublished === false ? 0 : 1, ts, ts]
  );
  return res.json({ ok: true, lessonId: r.lastID });
});

// Admin: update lesson
router.put('/admin/lessons/:lessonId', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  const existing = await db.get('SELECT id FROM course_lessons WHERE id=?', [lessonId]);
  if (!existing) return res.status(404).json({ error: 'Lesson not found' });

  const { title, lessonType, contentText, contentUrl, estimatedMinutes, isPublished } = req.body || {};
  const ts = nowIso();
  await db.run(
    `UPDATE course_lessons
     SET title=COALESCE(?,title), lesson_type=COALESCE(?,lesson_type), content_text=COALESCE(?,content_text), content_url=COALESCE(?,content_url),
         estimated_minutes=COALESCE(?,estimated_minutes), is_published=COALESCE(?,is_published), updated_at=?
     WHERE id=?`,
    [title || null, lessonType || null, contentText ?? null, contentUrl ?? null, estimatedMinutes !== undefined ? (estimatedMinutes === null ? null : Number(estimatedMinutes)) : null,
     typeof isPublished === 'boolean' ? (isPublished ? 1 : 0) : null, ts, lessonId]
  );
  return res.json({ ok: true });
});

// Admin: delete lesson
router.delete('/admin/lessons/:lessonId', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  await db.run('DELETE FROM course_lessons WHERE id=?', [lessonId]);
  return res.json({ ok: true });
});

// Admin: reorder lessons
router.put('/admin/modules/:moduleId/lessons/reorder', requireAuth, requireRole('admin'), async (req, res) => {
  const { lessonIds } = req.body || {};
  if (!Array.isArray(lessonIds)) return res.status(400).json({ error: 'lessonIds array required' });
  const db = await getDb();
  const moduleId = Number.parseInt(req.params.moduleId, 10);
  if (!Number.isInteger(moduleId)) return res.status(400).json({ error: 'Invalid moduleId' });

  let pos = 1;
  for (const id of lessonIds) {
    await db.run('UPDATE course_lessons SET position=?, updated_at=? WHERE id=? AND module_id=?', [pos, nowIso(), Number(id), moduleId]);
    pos += 1;
  }
  return res.json({ ok: true });
});

// Admin: list resources for lesson
router.get('/admin/lessons/:lessonId/resources', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  const rows = await db.all(
    `SELECT id, lesson_id AS "lessonId", resource_type AS "resourceType", title, url, path, created_at AS "createdAt"
     FROM lesson_resources WHERE lesson_id=? ORDER BY id DESC`,
    [lessonId]
  );
  return res.json({ resources: rows });
});

// Admin: add link resource
router.post('/admin/lessons/:lessonId/resources/link', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  const ts = nowIso();
  const r = await db.run(
    `INSERT INTO lesson_resources (lesson_id, resource_type, title, url, path, created_at)
     VALUES (?,?,?,?,?,?)`,
    [lessonId, 'link', title || null, url, null, ts]
  );
  return res.json({ ok: true, resourceId: r.lastID });
});

// Admin: upload file resource
router.post('/admin/lessons/:lessonId/resources/upload', requireAuth, requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const db = await getDb();
  const lessonId = Number.parseInt(req.params.lessonId, 10);
  if (!Number.isInteger(lessonId)) return res.status(400).json({ error: 'Invalid lessonId' });
  const rel = `/uploads/${req.file.filename}`;
  const ts = nowIso();
  const r = await db.run(
    `INSERT INTO lesson_resources (lesson_id, resource_type, title, url, path, created_at)
     VALUES (?,?,?,?,?,?)`,
    [lessonId, 'file', req.file.originalname || null, null, rel, ts]
  );
  return res.json({ ok: true, resourceId: r.lastID, path: rel });
});

// Admin: delete resource
router.delete('/admin/resources/:resourceId', requireAuth, requireRole('admin'), async (req, res) => {
  const db = await getDb();
  const resourceId = Number.parseInt(req.params.resourceId, 10);
  if (!Number.isInteger(resourceId)) return res.status(400).json({ error: 'Invalid resourceId' });
  await db.run('DELETE FROM lesson_resources WHERE id=?', [resourceId]);
  return res.json({ ok: true });
});

module.exports = router;
