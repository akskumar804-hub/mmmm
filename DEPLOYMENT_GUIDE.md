# Deployment Guide: Exam Type Selection & Admin-Controlled Proctoring

## Pre-Deployment Checklist

- [ ] All code changes reviewed
- [ ] Database migration 008 ready
- [ ] Admin UI tested locally
- [ ] Student UI tested locally
- [ ] API endpoints tested with Postman/Thunder Client

## Deployment Steps

### Step 1: Deploy to Render (Backend)

1. **Commit and push changes**:

   ```bash
   git add .
   git commit -m "feat: Add exam type selection and admin-controlled proctoring"
   git push origin main
   ```

2. **Wait for Render to auto-deploy** or manually trigger deployment

3. **Monitor Render logs** for migration success:
   - Check that migration 008 runs successfully
   - Should create new columns on exams table
   - Should add indexes for performance

### Step 2: Deploy Frontend

1. **Commit and push frontend changes**:

   ```bash
   cd frontend
   git add .
   git commit -m "feat: Update exam builder and student exam UI"
   git push origin main
   ```

2. **Render auto-deploys** or manually trigger

3. **Clear browser cache** to ensure new UI loads

## Database Migration Details

### Migration File

Location: `backend/src/migrations/008_exam_types_proctoring.sql`

**What it does**:

- Adds 5 new columns to `exams` table (safe - uses `IF NOT EXISTS`)
- Creates 2 new indexes for query performance
- Does NOT modify existing data
- Safe for existing exams (defaults applied)

**Existing Exams**:

- Will have `exam_type = 'MIXED'` (default)
- Will have empty `question_type_config = NULL`
- Will have `proctor_required = 0` (proctoring optional)
- Will have `proctor_mode = 'BASIC'` (default)
- Will have `proctor_screenshare_required = 0` (screen sharing optional)

### Manual Verification

After deployment, verify in PostgreSQL:

```sql
-- Check columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'exams'
ORDER BY ordinal_position;

-- Verify data
SELECT id, exam_type, proctor_required, proctor_mode FROM exams LIMIT 5;

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'exams';
```

## API Testing

### Test Case 1: Create Exam with MCQ Type

```bash
POST /admin/subjects/{subjectId}/exam
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Math Quiz",
  "durationMinutes": 45,
  "questions": [{...}],
  "examType": "MCQ",
  "questionTypeConfig": {},
  "proctorRequired": false,
  "proctorMode": "BASIC",
  "proctorScreenshareRequired": false
}
```

### Test Case 2: Create Exam with Mixed Types + Proctoring

```bash
POST /admin/subjects/{subjectId}/exam
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Advanced Exam",
  "durationMinutes": 90,
  "questions": [{...}],
  "examType": "MIXED",
  "questionTypeConfig": {
    "MCQ": 5,
    "FILL_BLANKS": 3,
    "FREE_TEXT": 2
  },
  "proctorRequired": true,
  "proctorMode": "WEBCAM",
  "proctorScreenshareRequired": true
}
```

### Test Case 3: Get Exam (Verify All Fields Returned)

```bash
GET /admin/subjects/{subjectId}/exam
Authorization: Bearer {token}

# Response should include:
{
  "exam": {
    "id": 1,
    "title": "...",
    "durationMinutes": 45,
    "questionsJson": "...",
    "examType": "MIXED",
    "questionTypeConfig": {...},
    "proctorRequired": true,
    "proctorMode": "WEBCAM",
    "proctorScreenshareRequired": true,
    "questions": [...]
  }
}
```

### Test Case 4: Student Starts Exam (Proctoring Settings from Server)

```bash
POST /student/exams/{subjectId}/proctor/start
Content-Type: application/json
Authorization: Bearer {token}

{
  "clientInfo": {
    "fingerprint": "...",
    "userAgent": "...",
    "screen": {...},
    "viewport": {...}
  }
}

# Response includes server-determined settings:
{
  "sessionId": 123,
  "startedAt": "2025-01-01T...",
  "mode": "WEBCAM",           # From admin config, not request
  "screenshareEnabled": true  # From admin config, not request
}
```

## Rollback Plan

If issues arise post-deployment:

### Option 1: Immediate Rollback

```bash
# Revert to previous commit
git revert <commit-hash>
git push origin main
# Render auto-deploys previous version
```

### Option 2: Database Rollback

The migration is safe and additive. To "disable" the feature:

1. Deploy previous version of code
2. Leave database columns (no harm, no data loss)
3. New code will ignore the columns

### Option 3: Selective Rollback

```sql
-- If needed to remove columns (requires ALTER)
ALTER TABLE exams DROP COLUMN exam_type;
ALTER TABLE exams DROP COLUMN question_type_config;
-- etc...
```

## Performance Considerations

- New indexes on `exam_type` and `proctor_required` improve query performance
- `question_type_config` stored as JSON in single column (efficient for reads)
- Proctoring check happens once per session start (minimal impact)

## Monitoring Post-Deployment

1. **Check Application Logs**:

   - Monitor for any migration errors
   - Check for API errors in exam builder or student exam routes

2. **Test Key Flows**:

   - Admin creates exam with proctoring
   - Student starts exam and system enforces proctoring
   - Existing exams still work with defaults

3. **Performance**:
   - Monitor API response times for `/admin/subjects/:id/exam`
   - Monitor `/student/exams/:id/proctor/start` endpoint
   - Check database query performance

## Rollback Triggers

Consider rollback if:

- ❌ Migration fails on Render
- ❌ API returns 500 errors for exam routes
- ❌ Admin can't save exams with new fields
- ❌ Students can't start exams
- ❌ Existing exams break

## Success Criteria

✅ Admin can create exam with MCQ/Fill Blanks/Free Text/Mixed types
✅ Admin can configure question type counts for Mixed exams
✅ Admin can enable/disable and configure proctoring per exam
✅ Student sees proctoring requirements before starting exam
✅ Student cannot choose proctoring mode (server enforces)
✅ Existing exams continue to work with default values
✅ Database migration completes without errors
✅ No data loss or corruption

## Support

If issues occur:

1. Check Render deployment logs
2. Verify migration 008 executed
3. Check database connection string
4. Review API response bodies for detailed errors
5. Check browser console for frontend errors

---

**Deployment Date**:
**Deployed By**:
**Status**: [ ] Pending [ ] In Progress [ ] Complete [ ] Rolled Back
