const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const { getDb } = require('./db');
const { nowIso } = require('./utils/helpers');

const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const contentRoutes = require('./routes/content');
const profileRoutes = require('./routes/profile');
const enrollmentRoutes = require('./routes/enrollments');
const examsRoutes = require('./routes/exams');
const paymentsRoutes = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');
const proctorAdminRoutes = require('./routes/proctorAdmin');
const publicRoutes = require('./routes/public');

const { startJobs } = require('./jobs');

const PORT = parseInt(process.env.PORT || '4000', 10);

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'uploads');

const fs = require('fs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });


async function seedAdmin(db) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPass = (process.env.ADMIN_PASSWORD || '').trim();
  const adminName = process.env.ADMIN_NAME || 'Admin';

  if (!adminEmail || !adminPass) {
    console.warn('⚠️  ADMIN_EMAIL / ADMIN_PASSWORD not set. Admin login will not work until configured.');
    return;
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (existing) return;

  const hash = await bcrypt.hash(adminPass, 10);
  const ts = nowIso();
  await db.run(
    `INSERT INTO users (role,email,password_hash,name)
     VALUES ('admin',?,?,?)`,
    [adminEmail, hash, adminName]
  );
  console.log('✅ Admin user seeded:', adminEmail);
}

async function seedDemoData(db) {
  const cnt = await db.get('SELECT COUNT(*) AS c FROM courses');
  if ((cnt?.c || 0) > 0) return;

  const ts = nowIso();

  const demoCourses = [
    {
      code: 'BSC-CS',
      title: 'B.Sc Computer Science',
      shortDescription: 'Foundational program in algorithms, programming, and modern software development.',
      description:
        'This three-year undergraduate program focuses on core computing concepts including data structures, algorithms, web technologies, and database systems. Students learn through a mix of lectures, labs, and project work.',
      tuitionFee: 15000,
      duration: '3 Years',
      level: 'Undergraduate',
      subjects: [
        { name: 'Data Structures', semester: 'Semester 1', chapters: ['Arrays & Linked Lists','Stacks & Queues','Trees & Graphs','Hashing & Complexity'] },
        { name: 'Database Systems', semester: 'Semester 2', chapters: ['Relational Model','SQL Fundamentals','Transactions','Indexing & Optimization'] }
      ]
    },
    {
      code: 'BBA-GEN',
      title: 'Bachelor of Business Administration',
      shortDescription: 'Business fundamentals with a focus on marketing, finance, and operations.',
      description:
        'The BBA program introduces students to management, marketing, finance, and entrepreneurship. It is designed for future leaders of modern businesses.',
      tuitionFee: 14000,
      duration: '3 Years',
      level: 'Undergraduate',
      subjects: [
        { name: 'Principles of Management', semester: 'Semester 1', chapters: ['Planning & Organizing','Staffing & Leading','Controlling','Decision Making'] },
        { name: 'Marketing Basics', semester: 'Semester 2', chapters: ['Market Research','Segmentation & Targeting','Branding','Digital Marketing Intro'] }
      ]
    },
    {
      code: 'MSC-DS',
      title: 'M.Sc Data Science',
      shortDescription: 'Postgraduate specialization in data analytics, machine learning, and big data.',
      description:
        'This program is tailored for graduates who want to specialize in data analytics and machine learning. It covers statistics, programming, and real-world analytic projects.',
      tuitionFee: 18000,
      duration: '2 Years',
      level: 'Postgraduate',
      subjects: [
        { name: 'Statistics for Data Science', semester: 'Semester 1', chapters: ['Probability Basics','Distributions','Hypothesis Testing','Regression'] },
        { name: 'Machine Learning Foundations', semester: 'Semester 2', chapters: ['Supervised Learning','Unsupervised Learning','Model Evaluation','Model Deployment'] }
      ]
    }
  ];

  const examBank = [
    {
      subjectName: 'Data Structures',
      durationMinutes: 45,
      questions: [
        { id: 'q1', text: 'Which data structure follows the First In, First Out (FIFO) principle?', options: ['Stack','Queue','Tree','Graph'], correctIndex: 1 },
        { id: 'q2', text: 'Which of the following is the best data structure for implementing recursion?', options: ['Queue','Array','Stack','Graph'], correctIndex: 2 },
        { id: 'q3', text: 'Which operation is generally fastest on a hash table with a good hash function?', options: ['Search','Insertion','Deletion','All of the above'], correctIndex: 3 }
      ]
    },
    {
      subjectName: 'Principles of Management',
      durationMinutes: 30,
      questions: [
        { id: 'q1', text: 'Which management function involves setting objectives and deciding in advance how to achieve them?', options: ['Planning','Organizing','Directing','Controlling'], correctIndex: 0 },
        { id: 'q2', text: 'Which of the following is NOT a level of management?', options: ['Top-level','Middle-level','First-line','External-level'], correctIndex: 3 },
        { id: 'q3', text: 'Which principle emphasizes that an employee should receive orders from only one superior?', options: ['Unity of command','Scalar chain','Discipline','Order'], correctIndex: 0 }
      ]
    },
    {
      subjectName: 'Statistics for Data Science',
      durationMinutes: 45,
      questions: [
        { id: 'q1', text: 'Which measure of central tendency is most affected by extreme values?', options: ['Mean','Median','Mode','All are equally affected'], correctIndex: 0 },
        { id: 'q2', text: 'The probability of all mutually exclusive events in a sample space sums to:', options: ['0','1','Between 0 and 1','Depends on the experiment'], correctIndex: 1 },
        { id: 'q3', text: 'Which of the following is commonly used as a loss function in linear regression?', options: ['Cross-entropy','Mean squared error','Hinge loss','Log loss'], correctIndex: 1 }
      ]
    }
  ];

  for (const c of demoCourses) {
    const contentJson = {
      contentTypesSupported: [
        'Text lesson (rich text)',
        'PDF / notes upload',
        'Video (YouTube/Vimeo link or upload)',
        'Audio upload',
        'Image / infographic',
        'Assignments (file upload)',
        'Quizzes / exams (MCQ)',
        'Live class link (Zoom/Meet)',
        'External link / reference'
      ],
      chapters: c.subjects
    };

    const r = await db.run(
      `INSERT INTO courses (code,title,short_description,description,level,duration,admission_fee,tuition_fee,content_json)
       VALUES (?,?,?,?,?,?,3000,?,?)`,
      [c.code, c.title, c.shortDescription, c.description, c.level, c.duration, c.tuitionFee, JSON.stringify(contentJson)]
    );
    const courseId = r.lastID;

    for (const s of c.subjects) {
      const sr = await db.run(
        `INSERT INTO subjects (course_id,name,semester,passing_score,total_marks)
         VALUES (?,?,?,?,?)`,
        [courseId, s.name, s.semester, 40, 100]
      );
      const subjectId = sr.lastID;

      const exam = examBank.find((e) => e.subjectName === s.name);
      if (exam) {
        await db.run(
          `INSERT INTO exams (course_id,subject_id,title,duration_minutes,questions_json)
           VALUES (?,?,?,?,?)`,
          [courseId, subjectId, `${s.name} - MCQ Exam`, exam.durationMinutes, JSON.stringify(exam.questions)]
        );
      }
    }
  }

  console.log('✅ Demo courses/subjects/exams seeded.');
}

async function main() {
  const app = express();
  app.set('trust proxy', 1);
  const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin, credentials: true }));
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  // Static uploads
  app.use('/uploads', express.static(UPLOAD_DIR));

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', coursesRoutes);
  app.use('/api', contentRoutes);
  app.use('/api', profileRoutes);
  app.use('/api', enrollmentRoutes);
  app.use('/api', examsRoutes);
  app.use('/api', proctorAdminRoutes);
  app.use('/api', paymentsRoutes);
  app.use('/api', analyticsRoutes);
  app.use('/api', publicRoutes);

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Seed
  const db = await getDb();
  await seedAdmin(db);
  await seedDemoData(db);

  app.listen(PORT, () => {
    console.log(`✅ LMS backend running on http://localhost:${PORT}`);
    console.log(`CORS origin allowed: ${origin}`);
  });

  // Background jobs (emails + auto completion)
  startJobs();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
