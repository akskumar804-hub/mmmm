const mysql = require('mysql2/promise');
const { runMigrations } = require('./migrations');

/**
 * Render + MySQL compatible DB layer.
 *
 * We keep a small compatibility wrapper (get/all/run) so routes don't need heavy rewrites.
 * - Converts sqlite-style '?' placeholders to mysql-style '?'
 * - For INSERTs (without RETURNING), automatically appends `RETURNING id` and returns { lastID }
 *
 * ✅ Schema behavior
 * - Tables are created/updated automatically on server start via versioned migrations.
 */

let _pool = null;
let _ready = null;

function parseDbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Configure DATABASE_URL before starting the server.');
  }

  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: u.username,
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '')
    };
  } catch (e) {
    throw new Error(`Invalid DATABASE_URL format: ${e.message}`);
  }
}

function getPool() {
  if (_pool) return _pool;

  const config = parseDbUrl();
  _pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  return _pool;
}

function convertPlaceholders(sql) {
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let cur = '';
  
  for (let idx = 0; idx < sql.length; idx++) {
    const ch = sql[idx];
    
    // Handle single-quoted strings
    if (ch === "'" && !inDouble) {
      cur += ch;
      if (sql[idx + 1] === "'") {
        // Escaped single quote ''
        cur += "'";
        idx += 1;
      } else {
        inSingle = !inSingle;
      }
      continue;
    }
    
    // Handle double-quoted strings
    if (ch === '"' && !inSingle) {
      cur += ch;
      if (sql[idx + 1] === '"') {
        // Escaped double quote ""
        cur += '"';
        idx += 1;
      } else {
        inDouble = !inDouble;
      }
      continue;
    }
    
    // Replace ? only if outside quoted strings
    if (ch === '?' && !inSingle && !inDouble) {
      cur += '?';
      continue;
    }
    
    cur += ch;
  }
  
  return cur;
}

// Robust SQL splitter (handles quotes + dollar-quoted blocks like DO $$ ... $$;)
function splitSql(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < sql.length) {
    const ch = sql[i];

    // Inside single-quoted string
    if (inSingle) {
      cur += ch;
      if (ch === "'") {
        // handle escaped ''
        if (sql[i + 1] === "'") {
          cur += "'";
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i += 1;
      continue;
    }

    // Inside double-quoted identifier
    if (inDouble) {
      cur += ch;
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    // Start of comments
    if (ch === '-' && sql[i + 1] === '-') {
      // line comment
      const end = sql.indexOf('\n', i + 2);
      if (end === -1) {
        cur += sql.slice(i);
        break;
      }
      cur += sql.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      // block comment
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        cur += sql.slice(i);
        break;
      }
      cur += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Quote toggles
    if (ch === "'") {
      inSingle = true;
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      cur += ch;
      i += 1;
      continue;
    }

    // Statement terminator
    if (ch === ';') {
      const stmt = cur.trim();
      if (stmt) out.push(stmt);
      cur = '';
      i += 1;
      continue;
    }

    cur += ch;
    i += 1;
  }

  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

async function execStatements(pool, sql) {
  const parts = splitSql(sql);
  for (const stmt of parts) {
    const conn = await pool.getConnection();
    try {
      await conn.query(stmt);
    } finally {
      conn.release();
    }
  }
}

async function ensureReady() {
  if (_ready) return _ready;
  _ready = (async () => {
    const pool = getPool();
    await runMigrations(pool);
    return pool;
  })();
  return _ready;
}

async function getDb() {
  const pool = await ensureReady();

  return {
    async get(sql, params = []) {
      const q = convertPlaceholders(sql);
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(q, params);
        return rows[0];
      } finally {
        conn.release();
      }
    },
    async all(sql, params = []) {
      const q = convertPlaceholders(sql);
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(q, params);
        return rows;
      } finally {
        conn.release();
      }
    },
    async run(sql, params = []) {
      let q = convertPlaceholders(sql);
      const conn = await pool.getConnection();
      try {
        const [result] = await conn.query(q, params);
        return { lastID: result.insertId, changes: result.affectedRows };
      } finally {
        conn.release();
      }
    },
    async exec(sql) {
      await execStatements(pool, sql);
    }
  };
}

module.exports = { getDb, getPool, ensureReady };
