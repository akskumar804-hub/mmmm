-- v003: Payment transactions (manual + Razorpay)
-- MySQL 8+ compatible

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- PAYMENTS
-- =========================
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enrollment_id INT NOT NULL,
  provider ENUM('manual','razorpay') NOT NULL,
  order_id VARCHAR(255),
  payment_id VARCHAR(255),
  signature VARCHAR(255),
  amount INT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status ENUM('CREATED','PAID','FAILED') NOT NULL DEFAULT 'CREATED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_enrollment
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_payments_enrollment 
  ON payments(enrollment_id);

-- =========================
-- ENROLLMENTS: PAYMENT SNAPSHOT
-- =========================
-- These columns are for quick access / denormalized read

ALTER TABLE enrollments
  ADD COLUMN payment_provider ENUM('manual','razorpay') NULL,
  ADD COLUMN payment_status ENUM('CREATED','PAID','FAILED') NULL,
  ADD COLUMN amount_paid INT NULL,
  ADD COLUMN currency VARCHAR(10) NULL,
  ADD COLUMN payment_order_id VARCHAR(255) NULL,
  ADD COLUMN payment_payment_id VARCHAR(255) NULL,
  ADD COLUMN payment_signature VARCHAR(255) NULL;

CREATE INDEX idx_enrollments_payment_order 
  ON enrollments(payment_order_id);

SET FOREIGN_KEY_CHECKS = 1;
