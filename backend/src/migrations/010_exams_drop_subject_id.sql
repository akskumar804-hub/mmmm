-- v010: Make subject_id nullable in exams
-- Exams are now course-based; subject_id is optional
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- EXAMS: SUBJECT OPTIONAL
-- =========================
ALTER TABLE exams
  MODIFY COLUMN subject_id INT NULL;

SET FOREIGN_KEY_CHECKS = 1;
