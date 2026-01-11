-- v007: Retake / cooldown fields for exam attempts
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- EXAM ATTEMPTS (RETakes)
-- =========================
ALTER TABLE exam_attempts
  ADD COLUMN cooldown_until DATETIME NULL,
  ADD COLUMN retake_gap_days INT NOT NULL DEFAULT 0;

-- =========================
-- INDEXES (CRON / ANALYTICS)
-- =========================
CREATE INDEX idx_attempts_cooldown_until
  ON exam_attempts(cooldown_until);

SET FOREIGN_KEY_CHECKS = 1;
