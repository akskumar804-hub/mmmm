-- v011: Add course_id support to exam_proctor_sessions for course-based exams
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- ADD course_id COLUMN
-- =========================
ALTER TABLE exam_proctor_sessions
  ADD COLUMN course_id INT NULL;

-- =========================
-- BACKFILL course_id FROM exams
-- =========================
UPDATE exam_proctor_sessions ps
JOIN subjects s ON s.id = ps.subject_id
JOIN courses c ON c.id = s.course_id
SET ps.course_id = c.id
WHERE ps.course_id IS NULL AND ps.subject_id IS NOT NULL;

-- =========================
-- ADD FOREIGN KEY FOR course_id
-- =========================
ALTER TABLE exam_proctor_sessions
  ADD CONSTRAINT fk_proctor_course
    FOREIGN KEY (course_id) REFERENCES courses(id)
    ON DELETE CASCADE;

-- =========================
-- ADD INDEX FOR course_id LOOKUPS
-- =========================
CREATE INDEX idx_proctor_sessions_course
  ON exam_proctor_sessions(course_id);

CREATE INDEX idx_proctor_sessions_user_course_status
  ON exam_proctor_sessions(user_id, course_id, status);

SET FOREIGN_KEY_CHECKS = 1;
