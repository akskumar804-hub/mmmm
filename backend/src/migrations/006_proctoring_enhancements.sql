-- v006: Proctoring enhancements (review fields, suspicious score, snapshot type, paper storage)
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- EXAM PROCTOR SESSIONS (ENHANCEMENTS)
-- =========================
ALTER TABLE exam_proctor_sessions
  ADD COLUMN suspicious_score INT NOT NULL DEFAULT 0,
  ADD COLUMN review_status ENUM('PENDING','APPROVED','REJECTED')
    NOT NULL DEFAULT 'PENDING',
  ADD COLUMN review_notes TEXT,
  ADD COLUMN ip_address VARCHAR(45),
  ADD COLUMN user_agent TEXT,
  ADD COLUMN fingerprint VARCHAR(255),
  ADD COLUMN paper_json JSON,
  ADD COLUMN paper_hash VARCHAR(64),
  ADD COLUMN screenshare_enabled TINYINT(1) NOT NULL DEFAULT 0;

-- =========================
-- PROCTOR SNAPSHOTS (TYPE)
-- =========================
ALTER TABLE exam_proctor_snapshots
  ADD COLUMN snapshot_type ENUM('WEBCAM','SCREEN')
    NOT NULL DEFAULT 'WEBCAM';

-- =========================
-- INDEXES FOR REVIEW FLOWS
-- =========================
CREATE INDEX idx_proctor_sessions_status
  ON exam_proctor_sessions(status);

CREATE INDEX idx_proctor_sessions_review
  ON exam_proctor_sessions(review_status);

SET FOREIGN_KEY_CHECKS = 1;
