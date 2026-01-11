-- v016: Add REJECTED status values to enrollments
-- Add PROFILE_REJECTED and PAYMENT_REJECTED to enrollment status enum

SET FOREIGN_KEY_CHECKS = 0;

-- Update enrollments status enum to include rejection states
ALTER TABLE enrollments
  MODIFY COLUMN status ENUM(
    'APPLIED',
    'PROFILE_SUBMITTED',
    'PROFILE_APPROVED',
    'PROFILE_REJECTED',
    'PAYMENT_PENDING',
    'RECEIPT_UPLOADED',
    'PAYMENT_REJECTED',
    'PAID',
    'ACTIVE',
    'COMPLETED'
  ) NOT NULL DEFAULT 'APPLIED';

SET FOREIGN_KEY_CHECKS = 1;
