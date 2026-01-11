-- v014: Add proctoring rules columns to exams table
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- ADD PROCTORING COLUMNS
-- =========================
ALTER TABLE exams
  ADD COLUMN proctor_required TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN proctor_mode ENUM('BASIC', 'WEBCAM') NOT NULL DEFAULT 'BASIC',
  ADD COLUMN proctor_screenshare_required TINYINT(1) NOT NULL DEFAULT 0;

SET FOREIGN_KEY_CHECKS = 1;
