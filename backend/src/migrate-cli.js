const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getPool } = require('./db');
const { runMigrations, rollbackLastMigration } = require('./migrations');

async function main() {
  const cmd = (process.argv[2] || 'up').toLowerCase();
  const pool = getPool();

  if (cmd === 'up') {
    await runMigrations(pool);
    await pool.end();
    return;
  }

  if (cmd === 'down') {
    await rollbackLastMigration(pool);
    await pool.end();
    return;
  }

  console.log('Usage: node src/migrate-cli.js [up|down]');
  process.exit(1);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
