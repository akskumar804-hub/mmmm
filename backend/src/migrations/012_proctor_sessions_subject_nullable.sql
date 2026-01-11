-- v012: Make subject_id nullable in exam_proctor_sessions for course-based exams support
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- MAKE subject_id NULLABLE
-- =========================
ALTER TABLE exam_proctor_sessions
  MODIFY COLUMN subject_id INT NULL;

SET FOREIGN_KEY_CHECKS = 1;
