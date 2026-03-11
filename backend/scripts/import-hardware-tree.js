/**
 * Import a hardware tree from an Excel file into the database.
 *
 * Usage:
 *   node scripts/import-hardware-tree.js \
 *     --file <path-to-xlsx>          \
 *     --equipment-id <id>            \
 *     --version-id <software_version_id>
 *
 * Optional:
 *   --api http://localhost:3000      (default)
 *   --notes "Some notes"            (notes for the new tree)
 *   --append <tree-id>              (add nodes to existing tree instead of creating a new one)
 *
 * Excel format (first sheet, row 1 = headers):
 *   level        | 0 = top-level slot, 1 = child, 2 = grandchild …
 *   name         | Required. Node name
 *   description  | Optional. Brief description
 *   address_dec  | Optional for children, required for level-0 slots
 *   address_hex  | Optional – if omitted, auto-derived from address_dec
 *
 * Example:
 *   level | name          | description  | address_dec | address_hex
 *   0     | CPU Module    | Main board   | 1           | 01
 *   1     | Sub-unit A    |              |             |
 *   2     | Deep chip     |              | 255         | FF
 *   0     | I/O Module    |              | 2           | 02
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const filePath    = getArg('--file');
const equipmentId = getArg('--equipment-id');
const versionId   = getArg('--version-id');
const apiBase     = getArg('--api') ?? 'http://localhost:3000';
const notes       = getArg('--notes') ?? null;
const appendId    = getArg('--append') ?? null; // existing tree id

if (!filePath || (!appendId && (!equipmentId || !versionId))) {
  console.error(`
Usage:
  node scripts/import-hardware-tree.js \\
    --file <path.xlsx> \\
    --equipment-id <id> \\
    --version-id <software_version_id> \\
    [--api http://localhost:3000] \\
    [--notes "Notes text"]

  # Or append to an existing tree:
  node scripts/import-hardware-tree.js \\
    --file <path.xlsx> \\
    --append <tree-id> \\
    [--api http://localhost:3000]
`);
  process.exit(1);
}

// ── Load SheetJS (xlsx) ───────────────────────────────────────────────────────
let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  console.error(
    '\nERROR: SheetJS (xlsx) is not installed.\n' +
    'Run:  npm install xlsx  (in the backend directory)\n'
  );
  process.exit(1);
}

// ── Read Excel ────────────────────────────────────────────────────────────────
console.log(`Reading file: ${filePath}`);
const buf  = readFileSync(filePath);
const wb   = XLSX.read(buf, { type: 'buffer' });
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

if (!rows.length) {
  console.error('ERROR: The file is empty or has no data rows.');
  process.exit(1);
}

const colMap = (row) => ({
  level:       parseInt(String(row['level']       ?? row['Level']       ?? 0), 10) || 0,
  name:        String(row['name']        ?? row['Name']        ?? '').trim(),
  description: String(row['description'] ?? row['Description'] ?? '').trim() || null,
  address_dec: String(row['address_dec'] ?? row['Address Dec'] ?? '').trim(),
  address_hex: String(row['address_hex'] ?? row['Address Hex'] ?? '').trim(),
});

// ── Helper: HTTP request ──────────────────────────────────────────────────────
async function apiPost(path, body) {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`POST ${path} → ${res.status}: ${j.error ?? res.statusText}`);
  }
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  let treeId;

  if (appendId) {
    treeId = parseInt(appendId, 10);
    console.log(`Appending to existing tree #${treeId}`);
  } else {
    console.log(`Creating hardware tree for equipment #${equipmentId}, version #${versionId}…`);
    const tree = await apiPost('/api/hardware-trees', {
      equipment_id:        parseInt(equipmentId, 10),
      software_version_id: parseInt(versionId,   10),
      notes,
    });
    treeId = tree.id;
    console.log(`Created tree #${treeId}`);
  }

  // node stack: stack[level] = last created node id at that level
  const nodeStack = [];
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = colMap(rows[i]);
    if (!r.name) { skipped++; continue; }

    const parentId = r.level === 0 ? null : (nodeStack[r.level - 1] ?? null);
    const addrDec  = r.address_dec !== '' ? parseInt(r.address_dec, 10) : null;
    const addrHex  = r.address_hex || null;

    if (parentId === null && addrDec === null) {
      console.warn(`  Skipping row ${i + 2}: "${r.name}" — level-0 slot requires address_dec`);
      skipped++;
      continue;
    }

    try {
      const node = await apiPost('/api/hardware-nodes', {
        hardware_tree_id: treeId,
        parent_id:   parentId,
        name:        r.name,
        description: r.description,
        address_dec: addrDec,
        address_hex: addrHex,
      });
      nodeStack[r.level] = node.id;
      nodeStack.length   = r.level + 1; // clear deeper levels
      console.log(`  [${r.level}] ${r.name}${addrDec !== null ? ` (${addrDec} / 0x${(addrHex || addrDec.toString(16).toUpperCase())})` : ''}`);
      created++;
    } catch (e) {
      console.error(`  ERROR row ${i + 2} "${r.name}": ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  console.log(`View tree: ${apiBase.replace('localhost', '127.0.0.1').replace('3000', '5173')}/hardware-tree/${treeId}`);
})().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
