const { nowIso } = require('./helpers');

/**
 * Compute & upsert aggregated course_progress.
 * A course is 'COMPLETED' if totalLessons == 0 OR completedLessons == totalLessons.
 */
async function computeAndUpsertCourseProgress(db, userId, courseId) {
  // Defensive checks - ensure userId and courseId are valid
  if (!userId || !courseId) {
    throw new Error(`computeAndUpsertCourseProgress: userId (${userId}) and/or courseId (${courseId}) are invalid`);
  }

  const totalRow = await db.get(
    `SELECT COUNT(*) AS c
     FROM course_lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE m.course_id = ? AND m.is_published = 1 AND l.is_published = 1`,
    [courseId]
  );
  const totalLessons = totalRow?.c ?? 0;

  const completedRow = await db.get(
    `SELECT COUNT(*) AS c
     FROM lesson_progress p
     JOIN course_lessons l ON l.id = p.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE p.user_id = ? AND m.course_id = ? AND p.status = 'COMPLETED' AND m.is_published = 1 AND l.is_published = 1`,
    [userId, courseId]
  );
  const completedLessons = completedRow?.c ?? 0;

  const timeRow = await db.get(
    `SELECT COALESCE(SUM(p.time_spent_seconds),0) AS s,
            MAX(p.last_accessed_at) AS last
     FROM lesson_progress p
     JOIN course_lessons l ON l.id = p.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE p.user_id = ? AND m.course_id = ?`,
    [userId, courseId]
  );
  const timeSpentSeconds = timeRow?.s ?? 0;
  const lastActivityAt = timeRow?.last || null;

  const completionPercent = totalLessons === 0 ? 100 : Math.min(100, Math.round((completedLessons / Math.max(1, totalLessons)) * 100));
  const status = completionPercent >= 100 ? 'COMPLETED' : (completedLessons > 0 || timeSpentSeconds > 0 ? 'IN_PROGRESS' : 'NOT_STARTED');
  const completedAt = status === 'COMPLETED' ? (await latestCompletionAt(db, userId, courseId)) : null;

  const ts = nowIso();
  const existing = await db.get('SELECT id FROM course_progress WHERE user_id=? AND course_id=?', [userId, courseId]);
  if (existing?.id) {
    await db.run(
      `UPDATE course_progress
       SET completion_percent=?, completed_lessons=?, total_lessons=?, time_spent_seconds=?, status=?, last_activity_at=?, completed_at=?, updated_at=?
       WHERE id=?`,
      [completionPercent, completedLessons, totalLessons, timeSpentSeconds, status, lastActivityAt, completedAt, ts, existing.id]
    );
  } else {
    await db.run(
      `INSERT INTO course_progress
        (user_id, course_id, completion_percent, completed_lessons, total_lessons, time_spent_seconds, status, last_activity_at, completed_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, courseId, completionPercent, completedLessons, totalLessons, timeSpentSeconds, status, lastActivityAt, completedAt, ts, ts]
    );
  }

  return { totalLessons, completedLessons, timeSpentSeconds, completionPercent, status, lastActivityAt, completedAt };
}

async function latestCompletionAt(db, userId, courseId) {
  const r = await db.get(
    `SELECT MAX(p.completed_at) AS m
     FROM lesson_progress p
     JOIN course_lessons l ON l.id = p.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE p.user_id = ? AND m.course_id = ? AND p.status='COMPLETED'`,
    [userId, courseId]
  );
  return r?.m || nowIso();
}

async function isCourseContentCompleted(db, userId, courseId) {
  const prog = await computeAndUpsertCourseProgress(db, userId, courseId);
  if (prog.totalLessons === 0) return true;
  return prog.completedLessons >= prog.totalLessons;
}

module.exports = { computeAndUpsertCourseProgress, isCourseContentCompleted };
