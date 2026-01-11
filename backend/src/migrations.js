const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Robust SQL splitter (handles quotes + dollar-quoted blocks like DO $$ ... $$;)
function splitSql(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let dollarTag = null; // e.g. $$ or $func$

  while (i < sql.length) {
    const ch = sql[i];

    // inside dollar-quoted string/block
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        cur += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }

    // inside single-quoted string
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

    // inside double-quoted identifier
    if (inDouble) {
      cur += ch;
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    // comments
    if (ch === '-' && sql[i + 1] === '-') {
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
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        cur += sql.slice(i);
        break;
      }
      cur += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // quote toggles
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

    // dollar-quote start
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        dollarTag = m[0];
        cur += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    // statement terminator
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

async function execStatements(conn, sql) {
  const parts = splitSql(sql);
  for (const stmt of parts) {
    try {
      await conn.query(stmt);
    } catch (err) {
      // MySQL error 1060: Duplicate column name (column already exists)
      // MySQL error 1091: Can't DROP; check that column/key exists
      // These are safe to ignore for idempotent migrations
      if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
        console.log(`⚠️  Ignoring error (idempotent): ${err.message}`);
        continue;
      }
      throw err;
    }
  }
}

async function ensureMigrationsTable(conn) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      version INT NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `
  );
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/i.test(f) && !/\.down\.sql$/i.test(f))
    .sort((a, b) => {
      const av = parseInt(a.split('_')[0], 10);
      const bv = parseInt(b.split('_')[0], 10);
      return av - bv;
    });
  return files;
}

async function getAppliedMap(conn) {
  const [rows] = await conn.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC');
  const map = new Map();
  for (const row of rows) map.set(row.version, row);
  return map;
}

async function runMigrations(pool) {
  const conn = await pool.getConnection();
  try {
    await ensureMigrationsTable(conn);
    const applied = await getAppliedMap(conn);

    const files = listMigrationFiles();
    for (const file of files) {
      const version = parseInt(file.split('_')[0], 10);
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      const checksum = sha256(sql);

      const already = applied.get(version);
      if (already) {
        if (already.checksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for v${version} (${file}). ` +
              `It looks like this migration file was changed after being applied. ` +
              `Create a NEW migration instead of editing an old one.`
          );
        }
        continue;
      }

      await conn.beginTransaction();
      try {
        await execStatements(conn, sql);
        await conn.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)',
          [version, file, checksum]
        );
        await conn.commit();
        console.log(`✅ Applied migration v${version}: ${file}`);
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    }
  } finally {
    conn.release();
  }
}

async function rollbackLastMigration(pool) {
  const conn = await pool.getConnection();
  try {
    await ensureMigrationsTable(conn);

    const [rows] = await conn.query(
      'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1'
    );
    if (!rows[0]) {
      console.log('ℹ️  No migrations to rollback.');
      return;
    }

    const { version, name } = rows[0];
    const downFile = name.replace(/\.sql$/i, '.down.sql');
    const downPath = path.join(MIGRATIONS_DIR, downFile);

    if (!fs.existsSync(downPath)) {
      throw new Error(
        `No down migration found for v${version}. Expected file: ${downFile}. ` +
          `Create it if you want rollback support.`
      );
    }

    const sql = fs.readFileSync(downPath, 'utf8');
    await conn.beginTransaction();
    try {
      await execStatements(conn, sql);
      await conn.query('DELETE FROM schema_migrations WHERE version = ?', [version]);
      await conn.commit();
      console.log(`↩️  Rolled back migration v${version}: ${name}`);
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  } finally {
    conn.release();
  }
}

module.exports = { runMigrations, rollbackLastMigration };
