/**
 * Attaches IO variable mappings from a B&R Automation Studio IO export to the
 * hardware nodes of an existing configuration tree in the database.
 *
 * Each row of the IO Excel file contains a single cell with a B&R variable
 * declaration in the form:
 *
 *   variableName AT %TYPE."instanceName".channelName;
 *
 * Examples:
 *   ::gMain.io.di.externalMasterJog AT %IX."X20DI8371".DigitalInput02;
 *   Cyclic#1.axExhaust_DrvIf.iLifeCnt AT %IB."AtexExhaust.drive".SDC_LifeCnt;
 *
 * The script looks up each instanceName in the hardware_nodes table of the
 * target tree and adds the IO entries as child nodes:
 *   name        = variable name  (e.g. "::gMain.io.di.externalMasterJog")
 *   description = "AT %IX.DigitalInput02"  (type prefix + channel — always
 *                 starts with "AT %" so existing IO children can be identified)
 *
 * Usage:
 *   node scripts/import-io.js \
 *     --file   <path-to-xlsx>    \
 *     --tree-id <id>
 *
 *   # Or identify the tree by model + version:
 *   node scripts/import-io.js \
 *     --file    <path-to-xlsx>   \
 *     --model   "FA-MKIII"       \
 *     --version "V2.1.5.0"
 *
 * Optional:
 *   --overwrite   Delete any previously imported IO children before re-importing.
 *                 IO children are identified by description starting with "AT %".
 *
 * Examples:
 *   node scripts/import-io.js --file exports/MKII-3_6_23_IO.xlsx --tree-id 3
 *   node scripts/import-io.js --file exports/MKII-3_6_23_IO.xlsx --model "FA-MKIII" --version "V2.1.5.0" --overwrite
 */

import pool from '../db.js';
import xlsx from 'xlsx';
import path from 'path';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const ioFile    = getArg('--file');
const treeIdArg = getArg('--tree-id');
const model     = getArg('--model');
const version   = getArg('--version');
const overwrite = args.includes('--overwrite');

if (!ioFile || (!treeIdArg && (!model || !version))) {
  console.error(`
Usage:
  node scripts/import-io.js \\
    --file <path.xlsx> \\
    --tree-id <id>

  # Or identify tree by model + version:
  node scripts/import-io.js \\
    --file    <path.xlsx> \\
    --model   <model>     \\
    --version <version>   \\
    [--overwrite]
`);
  process.exit(1);
}

// ── Parse one IO declaration line ─────────────────────────────────────────────
// Format: variableName AT %TYPE."instanceName".channelName;
const IO_RE = /^(.+?)\s+AT\s+%([A-Z]+)\."([^"]+)"\.([^;]+);?\s*$/;

function parseLine(raw) {
  const m = IO_RE.exec(raw.trim());
  if (!m) return null;
  return {
    variable:     m[1].trim(),           // e.g. "::gMain.io.di.externalMasterJog"
    typePrefix:   m[2],                  // e.g. "IX", "QX", "IW", "IB" …
    instanceName: m[3].trim(),           // e.g. "X20DI8371"
    channel:      m[4].trim(),           // e.g. "DigitalInput02"
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // ── Load and parse IO file ─────────────────────────────────────────────────
  const absPath = path.resolve(process.cwd(), ioFile);
  const wb      = xlsx.readFile(absPath);
  const ws      = wb.Sheets[wb.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  console.log(`Read ${rawRows.length} rows from: ${absPath}`);

  // Group parsed entries by instance name
  const byInstance = new Map(); // instanceName → [{ variable, typePrefix, channel }]
  let unparsed = 0;

  for (const row of rawRows) {
    const cell = String(row[0] ?? '').trim();
    if (!cell) continue;
    const entry = parseLine(cell);
    if (!entry) { unparsed++; continue; }
    if (!byInstance.has(entry.instanceName)) byInstance.set(entry.instanceName, []);
    byInstance.get(entry.instanceName).push(entry);
  }

  console.log(`Parsed ${[...byInstance.values()].reduce((s, a) => s + a.length, 0)} IO entries` +
              ` across ${byInstance.size} unique module instances` +
              (unparsed ? ` (${unparsed} lines skipped — unparseable)` : '') + '.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── Resolve tree id ────────────────────────────────────────────────────────
    let treeId;
    if (treeIdArg) {
      treeId = parseInt(treeIdArg, 10);
      const [[tree]] = await conn.query('SELECT id, name FROM hardware_trees WHERE id = ?', [treeId]);
      if (!tree) throw new Error(`No hardware tree found with id=${treeId}.`);
      console.log(`Target tree: id=${tree.id} name="${tree.name}"`);
    } else {
      const [[tree]] = await conn.query(
        'SELECT id, name FROM hardware_trees WHERE model = ? AND software_version = ?',
        [model, version]
      );
      if (!tree) throw new Error(`No hardware tree found for model="${model}" version="${version}".`);
      treeId = tree.id;
      console.log(`Target tree: id=${tree.id} name="${tree.name}"`);
    }

    // ── Load all nodes of this tree into a lookup map ──────────────────────────
    // name → [{ id, parent_id }]  (multiple nodes can share a name — rare but possible)
    const [nodes] = await conn.query(
      'SELECT id, parent_id, name FROM hardware_nodes WHERE hardware_tree_id = ?',
      [treeId]
    );
    const nodeByName = new Map();
    for (const n of nodes) {
      if (!nodeByName.has(n.name)) nodeByName.set(n.name, []);
      nodeByName.get(n.name).push(n);
    }

    // ── Process each instance ──────────────────────────────────────────────────
    let inserted  = 0;
    let deleted   = 0;
    let notFound  = 0;
    const missed  = [];

    for (const [instanceName, entries] of byInstance) {
      const matches = nodeByName.get(instanceName);

      if (!matches || matches.length === 0) {
        notFound++;
        missed.push(instanceName);
        continue;
      }

      // If a name resolves to multiple nodes, attach to the first one (position 0).
      // In practice this should be unique after the BM reorganisation.
      const targetNode = matches[0];

      if (overwrite) {
        // Remove previously imported IO children (identified by description LIKE 'AT %')
        const [del] = await conn.query(
          `DELETE FROM hardware_nodes
           WHERE parent_id = ? AND description LIKE 'AT %'`,
          [targetNode.id]
        );
        deleted += del.affectedRows;
      }

      // Determine starting position (after existing children)
      const [[{ maxPos }]] = await conn.query(
        'SELECT COALESCE(MAX(position), -1) AS maxPos FROM hardware_nodes WHERE parent_id = ?',
        [targetNode.id]
      );
      let pos = maxPos + 1;

      for (const e of entries) {
        const description = `AT %${e.typePrefix}.${e.channel}`;
        await conn.query(
          `INSERT INTO hardware_nodes
             (hardware_tree_id, parent_id, name, description, address_dec, address_hex, position)
           VALUES (?, ?, ?, ?, NULL, NULL, ?)`,
          [treeId, targetNode.id, e.variable.slice(0, 255), description.slice(0, 255), pos++]
        );
        inserted++;
      }

      if (inserted % 500 === 0 && inserted > 0) {
        process.stdout.write(`  ${inserted} IO entries inserted...\r`);
      }
    }

    await conn.commit();

    console.log(`\nImport complete:`);
    console.log(`  ${inserted} IO entries inserted`);
    if (overwrite) console.log(`  ${deleted} previous IO entries removed`);
    if (notFound > 0) {
      console.log(`  ${notFound} instance name(s) not found in tree — skipped:`);
      missed.forEach(n => console.log(`    - ${n}`));
    }
  } catch (err) {
    await conn.rollback();
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
