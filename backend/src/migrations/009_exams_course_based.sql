-- v009: Restructure exams to be course-level (remove subject dependency)
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- STEP 1: ADD course_id (NULLABLE FIRST)
-- =========================
ALTER TABLE exams
  ADD COLUMN course_id INT NULL;

-- =========================
-- STEP 2: BACKFILL course_id FROM subjects
-- =========================
UPDATE exams e
JOIN subjects s ON s.id = e.subject_id
SET e.course_id = s.course_id
WHERE e.course_id IS NULL;

-- =========================
-- STEP 3: ENFORCE NOT NULL
-- =========================
ALTER TABLE exams
  MODIFY COLUMN course_id INT NOT NULL;

-- =========================
-- STEP 4: ADD FOREIGN KEY
-- =========================
ALTER TABLE exams
  ADD CONSTRAINT fk_exams_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE CASCADE;

-- =========================
-- STEP 5: INDEXES
-- =========================
CREATE INDEX idx_exams_course
  ON exams(course_id);

CREATE INDEX idx_exams_course_exam_type
  ON exams(course_id, exam_type);

-- =========================
-- STEP 6: ONE EXAM PER COURSE
-- =========================
ALTER TABLE exams
  ADD CONSTRAINT uq_exams_course_id
    UNIQUE (course_id);

SET FOREIGN_KEY_CHECKS = 1;
