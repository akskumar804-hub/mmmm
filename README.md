# LMS Fullstack (Vite + Node/Express + PostgreSQL)

This repo is **frontend + backend** packaged together and prepared for **Render** using **Render Postgres**.

## Core requirements implemented

- **Student auth**: Register + Login + Forgot/Reset password (email link).
- **Admin auth**: **Hard-coded admin** (seeded on backend startup; controlled via `.env` / Render env vars).
- **Single payment per course**: Admission fee **₹3000** + **course-wise** tuition fee (paid once). **No exam fees.**
- **Student profile + uploads**: Latest education, photo, ID card, education document upload.
- **Admin approvals**:
  - Approve student profile ⇒ unlock payment receipt upload
  - Confirm payment ⇒ generate **Enrollment No**
  - Mark completed ⇒ issue certificate
- **Exams**:
  - Auto-evaluated on submission
  - Result is visible **only after 3 days**
  - **Subject-wise retake** (arrears style)
  - **Retake cooldown: 3 days AFTER result release**
- **Public verification page** (`/verify`): shows completion details using **Enrollment No + DOB**, includes student photo.
- **Automated email**: uses SMTP (optional). If SMTP is not configured, emails are printed to backend console.

---

## Project structure

```
.
├─ backend/   (Node.js + Express + PostgreSQL)
└─ frontend/  (Vite + React)
```

---

## Run locally

### 1) PostgreSQL (local)

You need a local Postgres DB, e.g. `lms`.

Example connection string:
```
postgres://postgres:postgres@localhost:5432/lms
```

### 2) Backend

```bash
cd backend
cp .env.example .env
# set DATABASE_URL in .env
npm install
npm run dev
```

Backend runs on `http://localhost:4000` and API base is `http://localhost:4000/api`.

**Default admin login (from `.env.example`):**
- Email: `admin@example.com`
- Password: `Admin@12345`

### 3) Frontend

```bash
cd ../frontend
cp .env.example .env
# set VITE_API_URL=http://localhost:4000/api
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

Open:
- Login: `http://localhost:5173/login`
- Verification: `http://localhost:5173/verify`

---

## Render deployment

See **RENDER_DEPLOYMENT.md** for step-by-step instructions.

---

## Uploads

Uploads are served at:
- `GET /uploads/<filename>`

For Render, use a **Persistent Disk** and set:
- `UPLOAD_DIR=/data/uploads` (or whatever mount path you choose)

---

## Notes
- Database schema is created automatically on backend startup (idempotent).
- Demo courses/subjects/exams are seeded automatically if the database is empty.


## Proctoring (Anti-cheat)

This project includes a lightweight proctoring layer for exams:

- Proctor session is started before loading questions (questions are served only via `/proctor/paper`).
- Randomized paper per session: question order + option order are shuffled server-side (answers are never sent to the client).
- Event logging: tab hidden, blur, fullscreen exit, copy/paste, right-click, key combos (F12/devtools), multi-tab, screen-share stopped/denied, PrintScreen (best-effort), network offline/online, etc.
- Snapshots: webcam and/or screen snapshots uploaded periodically (configurable).
- Auto-submit: frontend triggers auto-submit when max warnings is reached or time expires.
- Admin review: `/admin/proctoring` page to review sessions, events and snapshots, mark as CLEARED/FLAGGED.

### Environment variables (backend)

- `PROCTOR_REQUIRED=1` (recommended) – require a proctor session ID to submit the exam.
- `PROCTOR_MAX_WARNINGS=3` – max warnings before auto-submit.
- `EXAM_QUESTIONS_PER_ATTEMPT=0` – 0 = all questions, N = random subset per attempt.

### Environment variables (frontend)

- `VITE_PROCTOR_MAX_WARNINGS=3`
- `VITE_PROCTOR_SNAPSHOT_INTERVAL_SECONDS=30`
- `VITE_PROCTOR_REQUIRE_SCREENSHARE=0` (set to 1 to force screen share)

