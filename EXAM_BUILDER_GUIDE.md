# Exam Builder & Certificate System - Implementation Guide

## Overview

This implementation adds complete exam management, taking, and certificate issuance functionality to the LMS. Students can now take proctored exams and earn certificates upon passing.

## Features Implemented

### 1. **Admin Exam Builder**

**File**: `frontend/src/pages/admin/AdminExamBuilder.jsx`

#### Features:

- Create subjects for each course
- Build exams with multiple question types:
  - Multiple Choice (MCQ) with 4 options
  - True/False questions
- Set exam duration, passing score, and total marks
- Manage questions (add, edit, delete)
- Preview exam configuration before saving
- One-click subject creation from exam builder

#### How to Use:

1. Go to Admin > Courses
2. Click "Exams" button next to any course
3. Select or create a subject
4. Configure exam settings (title, duration)
5. Add questions with correct answers
6. Click "Create Exam" or "Update Exam" to save

### 2. **Backend Exam APIs**

**Files**:

- `backend/src/routes/exams.js` - Exam endpoints
- `backend/src/routes/courses.js` - Subject endpoints

#### New Endpoints:

**Admin Endpoints:**

```
GET /admin/courses/:id/subjects
  - List all subjects for a course

POST /admin/courses/:id/subjects
  - Create a new subject
  - Body: { name, semester?, passingScore?, totalMarks? }

GET /admin/subjects/:subjectId/exam
  - Get exam configuration for a subject

POST /admin/subjects/:subjectId/exam
  - Create or update exam
  - Body: { title, durationMinutes, questions[] }
```

**Student Endpoints:**

```
GET /student/certificates
  - List all earned certificates

GET /student/certificates/:certificateId
  - Get certificate details
```

### 3. **Exam Taking Interface**

**File**: `frontend/src/pages/student/StudentExamAttempt.jsx` (Enhanced)

The existing student exam attempt page already has:

- Full-screen exam mode
- Proctoring session management
- Webcam integration
- Screen share support
- Violation detection
- Auto-submission on violations
- Result release schedule

### 4. **Certificate Generation**

**File**: `backend/src/routes/exams.js`

#### Certificate Logic:

- Automatically generated when student passes an exam
- Unique certificate number assigned
- Stored in `certificates` table with:
  - User ID
  - Course ID
  - Certificate number
  - Issue date

#### Certificate Email:

- Congratulations email sent upon passing
- Contains certificate number and course title
- Links to profile for viewing/downloading

### 5. **Student Certificates Page**

**File**: `frontend/src/pages/student/StudentCertificates.jsx` (Enhanced)

#### Features:

- Display all earned certificates
- Card-based layout showing:
  - Course title and code
  - Issue date
  - Certificate number
  - Quick view and download buttons
- Certificate preview modal with professional styling
- Download as HTML functionality
- Print/Save as PDF support

#### How to Use:

1. Go to Student > Certificates
2. View all earned certificates
3. Click "View" to see certificate details
4. Click "Download" to save certificate

## Database Changes

### New Table Columns (Already exist in migrations):

```sql
-- exam_proctor_events table
- session_id, event_type, meta, created_at

-- exam_proctor_snapshots table
- session_id, file_path, snapshot_type, created_at

-- exam_proctor_sessions table
- id, user_id, subject_id, status, mode
- paper_json, seed_int, warning_count, events_count
- snapshots_count, suspicious_score, started_at, ended_at
- last_event_at, created_at, updated_at

-- exam_attempts table (enhanced)
- Added: proctor_session_id, proctor_warning_count, proctor_flags
- Added: cooldown_until, retake_gap_days

-- certificates table (already exists)
- id, user_id, course_id, certificate_no, issued_at
- created_at, updated_at
```

## Workflow: Complete Student Journey

### 1. **Enrollment Phase**

- Student enrolls in course
- Pays admission + tuition fees
- Status becomes PAID/ACTIVE

### 2. **Learning Phase**

- Student completes all course lessons
- Progress tracked automatically
- Must complete ALL lessons to unlock exams

### 3. **Exam Phase**

- Student sees "Attempt" button on exam
- Clicks to start proctoring session
- Selects proctoring mode:
  - BASIC: Tab monitoring only
  - WEBCAM: + Webcam + Screen share
- System provides randomized question paper
- Student answers all questions within time limit
- Can manually submit or auto-submits on violations

### 4. **Results Phase**

- Exam submitted
- Results held for RESULT_RELEASE_DAYS (default: 3 days)
- Email notification sent after result release
- Student can view:
  - Score percentage
  - Pass/Fail status
  - Proctoring warnings/violations

### 5. **Certificate Phase**

- If student PASSED:
  - Certificate automatically generated
  - Unique certificate number assigned
  - Congratulations email sent
  - Available in Student > Certificates
- If student FAILED:
  - Can retake after RETAKE_GAP_DAYS
  - Starts counting from result release date

## Configuration

### Environment Variables (Backend):

```env
# Exam result settings
RESULT_RELEASE_DAYS=3          # Days before result is visible
RETAKE_GAP_DAYS=3             # Days to wait between retakes (after result release)

# Proctoring settings
PROCTOR_REQUIRED=1            # Require proctoring to submit exam
PROCTOR_MAX_WARNINGS=3        # Auto-submit after N violations
PROCTOR_SNAPSHOT_MAX_BYTES=2000000  # Max webcam snapshot size

# Question randomization
EXAM_QUESTIONS_PER_ATTEMPT=0  # 0 = all questions, or specify number
```

## Security Features

### Proctoring:

1. **Tab Monitoring**: Detects tab switches, background activity
2. **Fullscreen Enforcement**: Exam must stay in fullscreen
3. **Copy/Paste Detection**: Prevents clipboard access
4. **Devtools Detection**: Prevents console access
5. **Webcam Snapshots**: Periodic captures for record keeping
6. **Screen Share**: Monitors entire screen for suspicious activity

### Violation Scoring:

- Each violation type has weighted score
- Serious violations (7-10 points): Tab hidden, Fullscreen exit, NAV away, Devtools, Printscreen
- Medium violations (3-6 points): Copy/Paste, Blur, Screenshare denied/stopped
- Minor violations (1-2 points): Right click, Key combo, Resize

### Answer Security:

- Questions randomized per attempt
- Server generates random paper with shuffled options
- Correct answers never sent to client until submission
- Only answers compared on submit

## API Integration Notes

### Question JSON Format:

```javascript
{
  id: "q1",                          // Unique ID
  type: "MCQ" | "TRUE_FALSE",        // Question type
  text: "Question text here",        // Question text
  options: ["A", "B", "C", "D"],    // Answer options
  marks: 1,                          // Points for correct answer
  correctAnswer: 0,                  // Index of correct option
  correctIndex: 0                    // Used internally during submission
}
```

### Paper JSON (Randomized per session):

```javascript
{
  durationMinutes: 30,
  questions: [
    { ...question, correctIndex: 2 }  // Shuffled correctly
  ],
  questionCount: 50,
  paperHash: "abc123..."
}
```

## Testing Checklist

- [ ] Create course and subject
- [ ] Create exam with 5+ questions
- [ ] Complete course lessons as student
- [ ] Attempt exam with proctoring
- [ ] Verify violation detection works
- [ ] Check result release timing
- [ ] Verify certificate is generated on pass
- [ ] View certificate in Student > Certificates
- [ ] Test certificate download
- [ ] Test exam retake with cooldown
- [ ] Verify emails are sent

## Troubleshooting

### Issue: "Exam not configured for this subject"

**Solution**: Make sure to create an exam in Admin > Exam Builder

### Issue: "Complete all course lessons to unlock exams"

**Solution**: Student must complete all lessons in the course first

### Issue: Certificate not appearing

**Solution**:

- Verify student passed exam (score >= passing score)
- Check result_release_at date has passed
- Check database for certificates table entries

### Issue: Proctoring not starting

**Solution**:

- Check `PROCTOR_REQUIRED` environment variable
- Verify browser supports fullscreen API
- Check browser console for permission errors

## Files Modified/Created

### Created:

1. `frontend/src/pages/admin/AdminExamBuilder.jsx` (NEW)

### Modified:

1. `backend/src/routes/exams.js` - Added certificate logic + APIs
2. `backend/src/routes/courses.js` - Added subject GET endpoint
3. `backend/src/utils/helpers.js` - Already has randomCertificateNo()
4. `frontend/src/pages/student/StudentCertificates.jsx` - Enhanced with preview & download
5. `frontend/src/pages/admin/AdminCourseBuilder.jsx` - Added Exam Builder link
6. `frontend/src/pages/admin/AdminCourses.jsx` - Added Exams link
7. `frontend/src/App.jsx` - Added exam builder route

### Unchanged (Already Functional):

1. `frontend/src/pages/student/StudentExamAttempt.jsx` - Full proctoring support
2. `backend/src/migrations/001_initial.sql` - All tables exist

## Next Steps / Future Enhancements

1. **PDF Generation**: Integrate library (pdfkit, jsPDF) for PDF certificates
2. **Question Bank**: Allow reusing questions across exams
3. **Question Types**: Add essay, short-answer, matching questions
4. **Analytics**: Question difficulty analysis, pass rates by question
5. **Exam Templates**: Save and reuse exam configurations
6. **Negative Marking**: Support for wrong answer penalties
7. **Timed Questions**: Different time limits per question
8. **Exam Scheduling**: Schedule exams for specific dates/times
9. **Bulk Operations**: Import questions from CSV/Excel
10. **Question Preview**: Allow students to preview exam format before attempt

## Support

For issues or questions, refer to the deployment guide: `RENDER_DEPLOYMENT.md`
