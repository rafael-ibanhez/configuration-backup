/**
 * Diagnostic: shows IO entry counts and the first/last few IO entries for
 * each hardware tree, so we can verify data was imported correctly.
 *
 * Usage:
 *   node scripts/diag-io.js                          # list all trees
 *   node scripts/diag-io.js --from-id 1 --to-id 2   # compare two trees
 */
import pool from '../db.js';

const args = process.argv.slice(2);
function getArg(f) { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; }
const fromId = getArg('--from-id');
const toId   = getArg('--to-id');

async function main() {
  const [trees] = await pool.query(
    'SELECT id, name, model, software_version FROM hardware_trees ORDER BY model, software_version'
  );

  console.log('\n=== Hardware Trees ===');
  for (const t of trees) {
    const [[{ total }]]  = await pool.query(
      'SELECT COUNT(*) AS total FROM hardware_nodes WHERE hardware_tree_id = ?', [t.id]
    );
    const [[{ io }]] = await pool.query(
      `SELECT COUNT(*) AS io FROM hardware_nodes
       WHERE hardware_tree_id = ? AND description LIKE 'AT %'`, [t.id]
    );
    console.log(`  id=${t.id}  ${t.model} ${t.software_version}  "${t.name}"  nodes=${total}  io_entries=${io}`);
  }

  if (!fromId || !toId) {
    console.log('\nRun with --from-id <id> --to-id <id> to inspect two trees in detail.');
    await pool.end(); return;
  }

  for (const [label, id] of [['FROM', fromId], ['TO', toId]]) {
    const [[tree]] = await pool.query('SELECT * FROM hardware_trees WHERE id = ?', [id]);
    if (!tree) { console.log(`\nTree id=${id} not found.`); continue; }

    console.log(`\n=== ${label}: id=${id}  ${tree.model} ${tree.software_version} ===`);

    // IO entries for this tree (description LIKE 'AT %')
    const [ioRows] = await pool.query(`
      SELECT
        io.id,
        io.name       AS variable,
        io.description AS channel,
        parent.name   AS module
      FROM hardware_nodes io
      JOIN hardware_nodes parent ON parent.id = io.parent_id
      WHERE io.hardware_tree_id = ?
        AND io.description LIKE 'AT %'
      ORDER BY parent.name, io.position
      LIMIT 30
    `, [id]);

    if (ioRows.length === 0) {
      console.log('  ⚠ NO IO entries found — run import-io.js for this tree first.');
    } else {
      console.log(`  First ${ioRows.length} IO entries:`);
      for (const r of ioRows) {
        console.log(`    [${r.module}]  ${r.channel}  →  ${r.variable}`);
      }
    }

    // Check specifically for the X20DI8371 module
    const [di] = await pool.query(`
      SELECT n.id, n.name, n.description, parent.name AS parent_name
      FROM hardware_nodes n
      LEFT JOIN hardware_nodes parent ON parent.id = n.parent_id
      WHERE n.hardware_tree_id = ?
        AND n.name LIKE '%X20DI8371%'
      LIMIT 10
    `, [id]);

    if (di.length === 0) {
      console.log('  ⚠ No node with name matching %X20DI8371% found in this tree.');
    } else {
      console.log(`  Nodes matching X20DI8371:`);
      for (const r of di) {
        console.log(`    id=${r.id}  name="${r.name}"  desc="${r.description?.slice(0,50)}"  parent="${r.parent_name}"`);
        // Show IO children
        const [ioChildren] = await pool.query(`
          SELECT name AS variable, description AS channel
          FROM hardware_nodes
          WHERE parent_id = ? AND description LIKE 'AT %'
          ORDER BY position
        `, [r.id]);
        if (ioChildren.length === 0) {
          console.log('      (no IO children)');
        } else {
          for (const c of ioChildren) {
            console.log(`      ${c.channel}  →  ${c.variable}`);
          }
        }
      }
    }
  }

  await pool.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
