-- v005: Exam proctoring (sessions, events, snapshots) + link to attempts
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- PROCTOR SESSIONS
-- =========================
CREATE TABLE IF NOT EXISTS exam_proctor_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject_id INT NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  status ENUM('ACTIVE','ENDED','SUBMITTED') 
    NOT NULL DEFAULT 'ACTIVE',
  mode ENUM('BASIC','WEBCAM') 
    NOT NULL DEFAULT 'BASIC',
  warning_count INT NOT NULL DEFAULT 0,
  events_count INT NOT NULL DEFAULT 0,
  snapshots_count INT NOT NULL DEFAULT 0,
  last_event_at DATETIME,
  client_info TEXT,
  CONSTRAINT fk_proctor_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_proctor_subject
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_proctor_sessions_user 
  ON exam_proctor_sessions(user_id);

CREATE INDEX idx_proctor_sessions_subject 
  ON exam_proctor_sessions(subject_id);

-- =========================
-- PROCTOR EVENTS
-- =========================
CREATE TABLE IF NOT EXISTS exam_proctor_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  meta JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_proctor_event_session
    FOREIGN KEY (session_id) REFERENCES exam_proctor_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_proctor_events_session 
  ON exam_proctor_events(session_id);

-- =========================
-- PROCTOR SNAPSHOTS
-- =========================
CREATE TABLE IF NOT EXISTS exam_proctor_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  file_path TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_proctor_snapshot_session
    FOREIGN KEY (session_id) REFERENCES exam_proctor_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_proctor_snapshots_session 
  ON exam_proctor_snapshots(session_id);

-- =========================
-- LINK TO EXAM ATTEMPTS
-- =========================
ALTER TABLE exam_attempts
  ADD COLUMN proctor_session_id INT NULL,
  ADD COLUMN proctor_warning_count INT NOT NULL DEFAULT 0,
  ADD COLUMN proctor_flags JSON NULL;

ALTER TABLE exam_attempts
  ADD CONSTRAINT fk_attempt_proctor_session
    FOREIGN KEY (proctor_session_id)
    REFERENCES exam_proctor_sessions(id)
    ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;
