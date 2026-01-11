-- v002: Course builder (modules, lessons, resources) + progress tracking
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- COURSE MODULES
-- =========================
CREATE TABLE IF NOT EXISTS course_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  position INT NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_module_course
    FOREIGN KEY (course_id) REFERENCES courses(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_modules_course_pos 
  ON course_modules(course_id, position);

-- =========================
-- COURSE LESSONS
-- =========================
CREATE TABLE IF NOT EXISTS course_lessons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  lesson_type ENUM('text','video','pdf','link') NOT NULL,
  content_text TEXT,
  content_url TEXT,
  position INT NOT NULL DEFAULT 0,
  estimated_minutes INT,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lesson_module
    FOREIGN KEY (module_id) REFERENCES course_modules(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_lessons_module_pos 
  ON course_lessons(module_id, position);

-- =========================
-- LESSON RESOURCES
-- =========================
CREATE TABLE IF NOT EXISTS lesson_resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lesson_id INT NOT NULL,
  resource_type ENUM('file','link') NOT NULL,
  title VARCHAR(255),
  url TEXT,
  path TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resource_lesson
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_resources_lesson 
  ON lesson_resources(lesson_id);

-- =========================
-- PER-LESSON PROGRESS
-- =========================
CREATE TABLE IF NOT EXISTS lesson_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  lesson_id INT NOT NULL,
  status ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED') 
    NOT NULL DEFAULT 'NOT_STARTED',
  time_spent_seconds INT NOT NULL DEFAULT 0,
  last_accessed_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_lesson (user_id, lesson_id),
  CONSTRAINT fk_lp_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_lp_lesson
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_lesson_progress_user 
  ON lesson_progress(user_id);

CREATE INDEX idx_lesson_progress_lesson 
  ON lesson_progress(lesson_id);

-- =========================
-- PER-COURSE PROGRESS (CACHED)
-- =========================
CREATE TABLE IF NOT EXISTS course_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  course_id INT NOT NULL,
  completion_percent INT NOT NULL DEFAULT 0,
  completed_lessons INT NOT NULL DEFAULT 0,
  total_lessons INT NOT NULL DEFAULT 0,
  time_spent_seconds INT NOT NULL DEFAULT 0,
  status ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED') 
    NOT NULL DEFAULT 'NOT_STARTED',
  last_activity_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_course (user_id, course_id),
  CONSTRAINT fk_cp_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cp_course
    FOREIGN KEY (course_id) REFERENCES courses(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_course_progress_user_course 
  ON course_progress(user_id, course_id);

SET FOREIGN_KEY_CHECKS = 1;
