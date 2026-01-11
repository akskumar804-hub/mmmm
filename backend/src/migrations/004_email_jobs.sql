-- v004: Email / job tracking flags
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- EXAM ATTEMPTS
-- =========================
ALTER TABLE exam_attempts
  ADD COLUMN result_email_sent TINYINT(1) NOT NULL DEFAULT 0;

-- =========================
-- ENROLLMENTS
-- =========================
ALTER TABLE enrollments
  ADD COLUMN exam_eligibility_email_sent TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN completion_email_sent TINYINT(1) NOT NULL DEFAULT 0;

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_attempts_result_release_pending
  ON exam_attempts (result_email_sent, result_release_at);

SET FOREIGN_KEY_CHECKS = 1;
