const cron = require('node-cron');

const { getDb } = require('./db');
const { sendEmail } = require('./utils/mailer');
const { nowIso, randomCertificateNo } = require('./utils/helpers');
const { isCourseContentCompleted } = require('./utils/progress');

async function processResultEmails() {
  const db = await getDb();
  const due = await db.all(
    `SELECT a.id, a.user_id AS userId, a.subject_id AS subjectId,
            a.attempt_no AS attemptNo, a.score_percent AS scorePercent,
            a.passed, a.result_release_at AS resultReleaseAt, a.cooldown_until AS cooldownUntil,
            u.email AS studentEmail, u.name AS studentName,
            s.name AS subjectName,
            c.title AS courseTitle
     FROM exam_attempts a
     JOIN users u ON u.id = a.user_id
     JOIN subjects s ON s.id = a.subject_id
     JOIN courses c ON c.id = s.course_id
     WHERE a.evaluated_at IS NOT NULL
       AND a.result_release_at IS NOT NULL
       AND a.result_email_sent = 0
       AND a.result_release_at <= NOW()
     ORDER BY a.id ASC
     LIMIT 200`
  );

  for (const r of due) {
    const statusText = r.passed ? 'PASSED' : 'FAILED';
    const cooldownLine = !r.passed && r.cooldownUntil ? `\nRetake available after: ${r.cooldownUntil}` : '';

    await sendEmail({
      to: r.studentEmail,
      subject: `Exam result released: ${r.subjectName} (${statusText})`,
      text:
        `Your result is now released.\n\nCourse: ${r.courseTitle}\nSubject: ${r.subjectName}\nAttempt: ${r.attemptNo}\nScore: ${r.scorePercent}%\nStatus: ${statusText}${cooldownLine}`,
      html:
        `<p>Your result is now released.</p>
         <ul>
           <li><strong>Course:</strong> ${r.courseTitle}</li>
           <li><strong>Subject:</strong> ${r.subjectName}</li>
           <li><strong>Attempt:</strong> ${r.attemptNo}</li>
           <li><strong>Score:</strong> ${r.scorePercent}%</li>
           <li><strong>Status:</strong> ${statusText}</li>
         </ul>
         ${!r.passed && r.cooldownUntil ? `<p>Retake available after: <strong>${r.cooldownUntil}</strong></p>` : ''}`
    });

    await db.run('UPDATE exam_attempts SET result_email_sent=1 WHERE id=?', [r.id]);
  }
}

async function processExamEligibilityEmails() {
  const db = await getDb();
  const rows = await db.all(
    `SELECT e.id AS enrollmentId, e.user_id AS userId, e.course_id AS courseId,
            u.email AS studentEmail, u.name AS studentName,
            c.title AS courseTitle
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.status IN ('PAID','ACTIVE','COMPLETED')
       AND COALESCE(e.exam_eligibility_email_sent,0)=0
     ORDER BY e.id ASC
     LIMIT 200`
  );

  for (const r of rows) {
    try {
      const ok = await isCourseContentCompleted(db, r.userId, r.courseId);
      if (!ok) continue;

      await sendEmail({
        to: r.studentEmail,
        subject: 'You are now eligible for exams',
        text: `You have completed the course lessons for ${r.courseTitle}. You can now attempt exams subject-wise.`,
        html: `<p>You have completed the course lessons for <strong>${r.courseTitle}</strong>.</p><p>You can now attempt exams subject-wise.</p>`
      });

      await db.run('UPDATE enrollments SET exam_eligibility_email_sent=1, updated_at=? WHERE id=?', [nowIso(), r.enrollmentId]);
    } catch (err) {
      console.error(`Error processing exam eligibility for enrollment ${r.enrollmentId}:`, err.message);
    }
  }
}

async function processAutoCourseCompletions() {
  const db = await getDb();

  const candidates = await db.all(
    `SELECT e.id AS enrollmentId, e.user_id AS userId, e.course_id AS courseId,
            e.completion_email_sent AS completionEmailSent,
            u.email AS studentEmail, u.name AS studentName,
            c.code AS courseCode, c.title AS courseTitle
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.status IN ('PAID','ACTIVE')
     ORDER BY e.id ASC
     LIMIT 200`
  );

  for (const r of candidates) {
    try {
      // Check if all subjects are passed at least once
      const totals = await db.get(
        `SELECT
            (SELECT COUNT(*) FROM subjects s WHERE s.course_id = ?) AS totalSubjects,
            (SELECT COUNT(DISTINCT s.id)
               FROM subjects s
               WHERE s.course_id = ?
                 AND EXISTS (
                   SELECT 1 FROM exam_attempts a
                   WHERE a.user_id = ? AND a.subject_id = s.id AND a.passed = 1
                 )
            ) AS passedSubjects`,
        [r.courseId, r.courseId, r.userId]
      );

      const totalSubjects = totals?.totalsubjects ?? totals?.totalSubjects ?? 0;
      const passedSubjects = totals?.passedsubjects ?? totals?.passedSubjects ?? 0;
      if (totalSubjects === 0) continue; // no subjects set
      if (passedSubjects < totalSubjects) continue;

      // Issue certificate if missing
      const ts = nowIso();
      const existingCert = await db.get('SELECT id, certificate_no AS certificateNo FROM certificates WHERE user_id=? AND course_id=?', [r.userId, r.courseId]);
      let certNo = existingCert?.certificateNo;
      if (!existingCert?.id) {
        certNo = randomCertificateNo(r.courseCode);
        await db.run(
          `INSERT INTO certificates (user_id, course_id, certificate_no, issued_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?)`,
          [r.userId, r.courseId, certNo, ts, ts, ts]
        );
      }

      await db.run(
        `UPDATE enrollments SET status='COMPLETED', completed_at=?, updated_at=? WHERE id=?`,
        [ts, ts, r.enrollmentId]
      );

      if (!r.completionEmailSent) {
        await sendEmail({
          to: r.studentEmail,
          subject: 'Course completed - Certificate issued',
          text: `Congratulations! You have completed ${r.courseTitle}. Certificate No: ${certNo}. You can verify completion on the public verification page.`,
          html: `<p>Congratulations! You have completed <strong>${r.courseTitle}</strong>.</p><p>Certificate No: <strong>${certNo}</strong></p><p>You can verify completion on the public verification page.</p>`
        });

        await db.run('UPDATE enrollments SET completion_email_sent=1, updated_at=? WHERE id=?', [ts, r.enrollmentId]);
      }
    } catch (err) {
      console.error(`Error processing auto-completion for enrollment ${r.enrollmentId}:`, err.message);
    }
  }
}

function startJobs() {
  // Every minute: due result emails
  cron.schedule('*/1 * * * *', () => {
    processResultEmails().catch((e) => console.error('job:processResultEmails', e));
  });

  // Every 5 minutes: eligibility + course completion
  cron.schedule('*/5 * * * *', () => {
    processExamEligibilityEmails().catch((e) => console.error('job:processExamEligibilityEmails', e));
    processAutoCourseCompletions().catch((e) => console.error('job:processAutoCourseCompletions', e));
  });

  console.log('✅ Background jobs scheduled (result emails, eligibility emails, auto-completions).');
}

module.exports = { startJobs, processResultEmails, processExamEligibilityEmails, processAutoCourseCompletions };
