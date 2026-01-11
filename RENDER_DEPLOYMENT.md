# Deploy to Render (Backend + Frontend + Render Postgres)

This guide deploys:
1) **Backend** as a Render **Web Service** (Node/Express)
2) **Frontend** as a Render **Static Site** (Vite build)
3) **Database** as Render **PostgreSQL**

---

## A) Create the Postgres database (Render)

1. In Render Dashboard → **New** → **PostgreSQL**
2. Create the database.
3. After creation, copy the **Internal Database URL** (preferred) or **External Database URL**.

> Render Postgres connections often require SSL; this project enables SSL automatically in production.  
> If you ever see “SSL/TLS required”, set `PGSSLMODE=require` too.

---

## B) Deploy the backend (Web Service)

### 1) Create service
1. Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repo that contains this code
3. **Root Directory:** `backend`
4. **Build Command:**
   ```bash
   npm install
   ```
5. **Start Command:**
   ```bash
   npm start
   ```
6. **Health Check Path:** `/health`

### 2) Add environment variables (Backend)
Render → Service → **Environment** → add these:

Required:
- `DATABASE_URL` = (paste your Render Postgres *Internal* URL)
- `JWT_SECRET` = any long random string
- `ADMIN_EMAIL` = your admin email
- `ADMIN_PASSWORD` = your admin password
- `CORS_ORIGIN` = your frontend URL (after you create frontend; you can temporarily set `*` for testing, but not recommended)
- `APP_URL` = your frontend URL (used to generate password-reset link)

Recommended:
- `PGSSLMODE=require` (if your DB requires SSL)
- `RESULT_RELEASE_DAYS=3`
- `RETAKE_GAP_DAYS=3`

Uploads (recommended on Render):
- Add a **Persistent Disk** to the backend service:
  - Mount path: `/data`
- Set:
  - `UPLOAD_DIR=/data/uploads`

SMTP (optional):
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

### 3) Deploy
Click **Deploy**. The backend will:
- Create DB tables automatically (via versioned migrations)
- Seed admin user (from env)
- Seed demo courses/exams if DB is empty

The backend keeps track of applied schema updates in a `schema_migrations` table.

Backend base URL will look like:
- `https://your-backend.onrender.com`
API base:
- `https://your-backend.onrender.com/api`

---

## C) Deploy the frontend (Static Site)

### 1) Create static site
1. Render Dashboard → **New** → **Static Site**
2. Connect the same repo
3. **Root Directory:** `frontend`
4. **Build Command:**
   ```bash
   npm install && npm run build
   ```
5. **Publish Directory:** `dist`

### 2) Frontend environment variable
Add:
- `VITE_API_URL` = `https://your-backend.onrender.com/api`

> This env var is used at build time, so set it before deploying.

### 3) SPA Routing (Rewrite rule)
In your Static Site settings, add a rewrite rule:
- Source: `/*`
- Destination: `/index.html`
- Action: **Rewrite** (200)

This is needed so refreshing on routes like `/dashboard` works. (Render Redirects/Rewrites docs)

### 4) Deploy
Click **Deploy** and open your site URL.

---

## D) Final checks

1. Frontend login/register works.
2. Backend `/health` returns `{ ok: true }`.
3. Uploads:
   - Student uploads photo/ID/edu doc
   - Receipt upload works after profile approval
4. Public verification:
   - `GET /api/verify?enrollmentNo=XXXX&dob=YYYY-MM-DD`

---

## Troubleshooting

### “SSL/TLS required”
- Add env: `PGSSLMODE=require`
- Ensure your `DATABASE_URL` is correct.

### Uploads disappear after redeploy
- You must add a **Persistent Disk** and set `UPLOAD_DIR` to the disk mount path.
- Example: mount `/data` and set `UPLOAD_DIR=/data/uploads`

### CORS error in browser
- Set backend `CORS_ORIGIN` exactly to your frontend domain (no trailing slash).

