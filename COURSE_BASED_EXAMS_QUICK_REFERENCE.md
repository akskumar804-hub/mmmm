# Quick Reference: Course-Based Exams

## What Changed

### The Problem

- Old workflow: Course → Subject → Exam (3 steps)
- Users had to create subjects before creating exams
- Exams were tied to subjects, not directly to courses

### The Solution

- New workflow: Course → Exam (2 steps)
- Create exams directly when editing a course
- Exams are now directly tied to courses
- One exam per course

## Admin Workflow (Updated)

### Creating an Exam for a Course

1. Navigate to Course Editor
2. Click "Exam Builder" button
3. **[NEW]** No subject selection needed!
4. Fill in exam details:
   - Title
   - Duration (minutes)
   - Exam Type (MCQ, Fill Blanks, Free Text, Mixed)
   - Proctoring requirements (admin-controlled)
5. Add questions
6. Click "Create Exam"

### Exam Configuration Options

```
Exam Type Selection:
  ├─ MCQ (Multiple Choice Questions)
  ├─ Fill Blanks (Fill in the Blanks)
  ├─ Free Text (Essay/Short Answer)
  └─ Mixed (Combination of above)

Proctoring Settings:
  ├─ Require Proctoring (Yes/No)
  ├─ Proctor Mode (BASIC / ADVANCED)
  └─ Require Screenshare (Yes/No)

Question Configuration:
  └─ Set count limits for each question type
     (e.g., 5 MCQ, 3 Fill Blanks, 2 Free Text)
```

## API Endpoints

### Admin: Exam Management

```
GET /admin/courses/:courseId/exam
  → Fetch exam for a course
  Returns: { exam: { id, title, durationMinutes, questions, ... } }

POST /admin/courses/:courseId/exam
  → Create or update exam for a course
  Body: { title, durationMinutes, questions, examType, ... }
  Returns: { exam: {...} }
```

### Student: Exam Attempt

```
GET /student/courses/:courseId/exam
  → Fetch exam to start attempting

POST /student/courses/:courseId/exam/attempt
  → Record exam attempt with answers
```

## Database Changes

### Migration 009: exams_course_based.sql

- Added `course_id` column to exams table
- Constraint: `UNIQUE(course_id)` - one exam per course
- Backfilled existing data from subject relationships
- Created indexes for performance

### Table Structure (exams)

```sql
id          INTEGER PRIMARY KEY
course_id   INTEGER NOT NULL UNIQUE -- NEW: direct course tie
subject_id  INTEGER (kept for backward compatibility)
title       VARCHAR(255)
duration_minutes INTEGER
questions_json TEXT
exam_type   VARCHAR(50)
question_type_config TEXT
proctor_required BOOLEAN
proctor_mode VARCHAR(20)
proctor_screenshare_required BOOLEAN
created_at  TIMESTAMP
updated_at  TIMESTAMP
```

## Code Changes

### Frontend: AdminExamBuilder.jsx

**Removed**:

- Subject selection dropdown
- "Create Subject" / "Add Subject" buttons
- Subject state management
- `handleSelectSubject()` function
- `createSubject()` function

**Updated**:

- `reload()` → Uses `/admin/courses/:courseId/exam`
- `saveExam()` → Uses `/admin/courses/:courseId/exam`
- Page subtitle updated

### Backend: routes/exams.js

**Added** (New Production Endpoints):

- `GET /admin/courses/:courseId/exam`
- `POST /admin/courses/:courseId/exam`

**Kept** (Deprecated but Functional):

- `GET /admin/subjects/:subjectId/exam`
- `POST /admin/subjects/:subjectId/exam`

## Backward Compatibility

✅ **Old subject-based endpoints still work** for existing data
✅ **Migration safely transitions existing data** via backfill
✅ **No breaking changes** to student exam workflow

## Next Phase (Optional)

Future updates to make students aware of exam changes:

1. Update `StudentExamAttempt` component
2. Update exam listing in student dashboard
3. Transition student endpoints to course-based
4. Remove deprecated subject endpoints

## Error Handling

If migration fails:

1. Check that all exams have valid subject_id
2. Verify subject records have course_id
3. Ensure foreign key constraints are correct
4. Run migration with `IF NOT EXISTS` clauses

## Testing

```bash
# Test exam creation
POST /admin/courses/1/exam
{
  "title": "Final Exam",
  "durationMinutes": 60,
  "questions": [...],
  "examType": "MIXED"
}

# Test exam retrieval
GET /admin/courses/1/exam
```

## Success Criteria ✅

- [x] Migration 009 created and safe
- [x] Backend endpoints added (GET + POST)
- [x] Frontend UI updated (no subject selection)
- [x] Backward compatibility maintained
- [x] One exam per course constraint enforced
- [x] All exam features preserved

---

**Status**: Production Ready ✅
**Deployment**: Run migration 009 on database, then deploy code changes
