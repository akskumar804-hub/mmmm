const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('../db');
const { nowIso } = require('../utils/helpers');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

// Generate a random 6-digit code for students
function generateRandomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Admin hardcoded code (from env)
const ADMIN_LOGIN_CODE = (process.env.ADMIN_LOGIN_CODE || '999999').toString();

function signToken(user) {
  const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, name: user.name || '' },
    secret,
    { expiresIn: '7d' }
  );
}

router.post(
  '/register',
  body('name').isLength({ min: 2 }).trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const { name, email, password } = req.body;
    const db = await getDb();

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const ts = nowIso();
    const result = await db.run(
      `INSERT INTO users (role,email,password_hash,name,created_at,updated_at)
       VALUES ('student',?,?,?,?,?)`,
      [email, hash, name, ts, ts]
    );

    const user = { id: result.lastID, role: 'student', email, name };
    const token = signToken(user);

    // Welcome email (best-effort)
    await sendEmail({
      to: email,
      subject: 'Welcome to the LMS',
      text: `Hi ${name}, your account has been created successfully.`,
      html: `<p>Hi <strong>${name}</strong>,</p><p>Your account has been created successfully.</p>`
    });

    return res.json({ token, user });
  }
);

router.post(
  '/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const db = await getDb();
    const user = await db.get('SELECT id,role,email,password_hash,name FROM users WHERE email = ?', [normalizedEmail]);

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // If it's the configured admin email, only allow admin role here.
    if (adminEmail && normalizedEmail === adminEmail) {
      if (user.role !== 'admin') return res.status(401).json({ error: 'Invalid credentials' });
    } else {
      // Otherwise, only allow student role here.
      if (user.role !== 'student') return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Generate and send login code
    const isAdmin = user.role === 'admin';
    const code = isAdmin ? ADMIN_LOGIN_CODE : generateRandomCode();
    const ts = nowIso();
    const expiresAt = dayjs().add(10, 'minute').format('YYYY-MM-DD HH:mm:ss');

    // For admin, delete any existing login codes to avoid duplicate key errors
    if (isAdmin) {
      await db.run(`DELETE FROM login_codes WHERE user_id = ?`, [user.id]);
    }

    // Store login code
    await db.run(
      `INSERT INTO login_codes (user_id, email, code, is_admin, expires_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [user.id, normalizedEmail, code, isAdmin ? 1 : 0, expiresAt, ts, ts]
    );

    // Send code via email (for students only, admin gets hardcoded code)
    if (!isAdmin) {
      await sendEmail({
        to: user.email,
        subject: 'Login Code - Your One-Time Code',
        text: `Your login code is: ${code}\n\nThis code expires in 10 minutes.`,
        html: `<p>Your login code is: <strong style="font-size: 24px; letter-spacing: 2px;">${code}</strong></p><p>This code expires in 10 minutes.</p>`
      }).catch(() => {});
    }

    // Return session ID for code verification
    return res.json({
      ok: true,
      sessionId: `${user.id}-${Date.now()}`,
      isAdmin,
      message: isAdmin ? `Use code: ${code}` : 'Code sent to your email'
    });
  }
);

// Verify login code and return JWT token
router.post(
  '/verify-code',
  body('email').isEmail().normalizeEmail(),
  body('code').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const { email, code } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const db = await getDb();
    const user = await db.get('SELECT id,role,email,name FROM users WHERE email = ?', [normalizedEmail]);

    if (!user) return res.status(401).json({ error: 'Invalid email' });

    // Find valid login code
    const loginCode = await db.get(
      `SELECT id, code, expires_at, used FROM login_codes
       WHERE email = ? AND code = ? AND used = 0 AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail, code.toString(), nowIso()]
    );

    if (!loginCode) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    // Mark code as used
    const ts = nowIso();
    await db.run(
      `UPDATE login_codes SET used = 1, used_at = ? WHERE id = ?`,
      [ts, loginCode.id]
    );

    const token = signToken(user);
    return res.json({
      ok: true,
      token,
      user: { id: user.id, role: user.role, email: user.email, name: user.name }
    });
  }
);

router.post(
  '/admin/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const { email, password } = req.body;
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPass = (process.env.ADMIN_PASSWORD || '').trim();

    if (!adminEmail || !adminPass) {
      return res.status(500).json({ error: 'Admin credentials are not configured on server' });
    }

    if (email.trim().toLowerCase() !== adminEmail) return res.status(401).json({ error: 'Invalid credentials' });

    const db = await getDb();
    // Admin account is seeded in DB on startup. Compare with stored hash to allow password resets.
    const admin = await db.get('SELECT id,role,email,password_hash,name FROM users WHERE email = ?', [adminEmail]);
    if (!admin) return res.status(500).json({ error: 'Admin user not initialized' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(admin);
    return res.json({ token, user: { id: admin.id, role: admin.role, email: admin.email, name: admin.name } });
  }
);

router.post(
  '/forgot-password',
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const { email } = req.body;
    const db = await getDb();
    const user = await db.get('SELECT id,email,name FROM users WHERE email = ?', [email]);
    // Always respond OK to avoid account enumeration.
    if (!user) return res.json({ ok: true });

    const token = uuidv4();
    const ts = nowIso();
    const expiresAt = dayjs().add(30, 'minute').format('YYYY-MM-DD HH:mm:ss');
    await db.run(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, used, created_at)
       VALUES (?,?,?,?,?)`,
      [user.id, token, expiresAt, 0, ts]
    );

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const resetUrl = `${appUrl}/login?resetToken=${encodeURIComponent(token)}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset your LMS password',
      text: `Use this link to reset your password: ${resetUrl}`,
      html: `<p>Hi ${user.name || ''},</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes.</p>`
    });

    return res.json({ ok: true });
  }
);

router.post(
  '/reset-password',
  body('token').isString().isLength({ min: 10 }),
  body('newPassword').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

    const { token, newPassword } = req.body;
    const db = await getDb();
    const rec = await db.get(
      'SELECT id,user_id,expires_at,used FROM password_reset_tokens WHERE token = ?',
      [token]
    );
    if (!rec) return res.status(400).json({ error: 'Invalid token' });
    if (rec.used) return res.status(400).json({ error: 'Token already used' });

    const dayjs = require('dayjs');
    if (dayjs().isAfter(dayjs(rec.expires_at))) return res.status(400).json({ error: 'Token expired' });

    const hash = await bcrypt.hash(newPassword, 10);
    const ts = nowIso();
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, ts, rec.user_id]);
    await db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [rec.id]);

    return res.json({ ok: true });
  }
);

module.exports = router;
