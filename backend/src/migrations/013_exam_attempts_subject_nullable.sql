-- v013: Make subject_id nullable in exam_attempts for course-based exams support
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- MAKE subject_id NULLABLE
-- =========================
ALTER TABLE exam_attempts
  MODIFY COLUMN subject_id INT NULL;

SET FOREIGN_KEY_CHECKS = 1;
