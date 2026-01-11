-- v008: Exam types (MCQ, Fill in Blanks, Free Text, Mixed)
-- and admin-controlled proctoring settings
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- EXAMS: TYPE & QUESTION CONFIG
-- =========================
ALTER TABLE exams
  ADD COLUMN exam_type ENUM('MCQ','FILL_BLANKS','FREE_TEXT','MIXED')
    NOT NULL DEFAULT 'MIXED',
  ADD COLUMN question_type_config JSON NULL;

-- =========================
-- EXAMS: PROCTORING CONTROLS (ADMIN)
-- =========================
ALTER TABLE exams
  ADD COLUMN proctor_required TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN proctor_mode ENUM('BASIC','WEBCAM')
    NOT NULL DEFAULT 'BASIC',
  ADD COLUMN proctor_screenshare_required TINYINT(1) NOT NULL DEFAULT 0;

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_exams_exam_type
  ON exams(exam_type);

CREATE INDEX idx_exams_proctor_required
  ON exams(proctor_required);

SET FOREIGN_KEY_CHECKS = 1;
