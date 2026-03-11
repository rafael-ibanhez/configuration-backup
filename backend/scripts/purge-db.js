/**
 * Purges ALL data from every table and resets auto-increment counters.
 * The schema (tables, columns, indexes) is left untouched.
 * Uploaded backup files in ./uploads/ are also deleted.
 *
 * Usage:
 *   node scripts/purge-db.js           -- prompts for confirmation
 *   node scripts/purge-db.js --yes     -- skips the prompt (CI / piped use)
 */

import pool from '../db.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const skipPrompt = process.argv.includes('--yes');

async function confirm(question) {
  if (skipPrompt) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve =>
    rl.question(question, ans => { rl.close(); resolve(ans.trim().toLowerCase() === 'y'); })
  );
}

async function main() {
  console.log('=== DATABASE PURGE ===');
  console.log('This will permanently delete ALL data from every table.');
  console.log('The schema will not be changed.\n');

  const ok = await confirm('Are you sure? (y/N) ');
  if (!ok) { console.log('Aborted.'); process.exit(0); }

  const conn = await pool.getConnection();
  try {
    // Disable FK checks so we can truncate in any order
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const tables = [
      'hardware_nodes',
      'hardware_trees',
      'backup_files',
      'slots',
      'software_versions',
      'equipment',
    ];

    for (const t of tables) {
      const [[{ cnt }]] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``);
      await conn.query(`TRUNCATE TABLE \`${t}\``);
      console.log(`  ✓ ${t.padEnd(20)} ${cnt} rows deleted`);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ── Clear uploaded backup files ──────────────────────────────────────────
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    let filesDeleted = 0;
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir).filter(f => f !== '.gitkeep');
      for (const f of files) {
        fs.rmSync(path.join(uploadsDir, f), { force: true });
        filesDeleted++;
      }
    }
    console.log(`  ✓ uploads/               ${filesDeleted} file(s) deleted`);

    console.log('\nDatabase purged successfully. Ready for import.\n');
    console.log('Next steps:');
    console.log('  node scripts/import-config.js <file.xlsx> "<model>" "<version>" "<name>"');
  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('\nError:', e.message);
  process.exit(1);
});
