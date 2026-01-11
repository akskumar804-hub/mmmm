-- v015: Fix review_status ENUM to include CLEARED and FLAGGED values
-- This fixes the data truncation error when setting review_status to 'CLEARED' or 'FLAGGED'

SET FOREIGN_KEY_CHECKS = 0;

-- Update the ENUM to include all valid review status values
ALTER TABLE exam_proctor_sessions
  MODIFY COLUMN review_status ENUM('PENDING','APPROVED','REJECTED','CLEARED','FLAGGED')
    NOT NULL DEFAULT 'PENDING';

SET FOREIGN_KEY_CHECKS = 1;
