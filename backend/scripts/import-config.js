/**
 * Imports a B&R Automation Studio hardware configuration export into the database.
 *
 * Expected Excel format (no header row, 3 columns):
 *   A: Article / order number      → stored as node description
 *   B: Instance name + module desc → stored as node name
 *   C: Position path:
 *        "$root"          → root node (parent_id = null)
 *        "SL2.IF1.ST5"    → hierarchical position; parent = all-but-last segments
 *        ""               → accessory / terminal block; child of preceding positioned node
 *
 * Duplicate paths (e.g. two rows with "SL2.IF1.ST1"):
 *   First row creates the node at that path.
 *   Subsequent rows become children of that node (e.g. memory keys, accessories).
 *
 * Missing intermediate paths (e.g. "SL2.IF1" never appears explicitly):
 *   Auto-created as placeholder nodes so the hierarchy is intact.
 *
 * Usage:
 *   node scripts/import-config.js <excel-file> <model> <version> [tree-name] [--overwrite] [--version-to=X]
 *
 * Examples:
 *   node scripts/import-config.js exports/example.xlsx "FA-MKIII" "V2.1.5.5" "MK-III"
 *   node scripts/import-config.js exports/example.xlsx "FA-MKIII" "V2.1.5.5" --overwrite
 *   node scripts/import-config.js exports/example.xlsx "FA-MKIII" "V2.1.5.0" "MK-III" --version-to=V2.1.9.9
 */

import pool from '../db.js';
import xlsx from 'xlsx';
import path from 'path';

// ── CLI args ─────────────────────────────────────────────────────────────────
const flags    = process.argv.slice(2).filter(a => a.startsWith('--'));
const posArgs  = process.argv.slice(2).filter(a => !a.startsWith('--'));
const overwrite = flags.includes('--overwrite');
const versionToFlag = flags.find(f => f.startsWith('--version-to='));
const versionTo = versionToFlag ? (versionToFlag.slice('--version-to='.length).trim() || null) : null;

const [excelFile, model, version, treeName] = posArgs;

if (!excelFile || !model || !version) {
  console.error('Usage: node scripts/import-config.js <excel-file> <model> <version> [tree-name] [--overwrite] [--version-to=X]');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/import-config.js exports/example.xlsx "FA-MKIII" "V2.1.5.5" "MK-III"');
  console.error('  node scripts/import-config.js exports/example.xlsx "FA-MKIII" "V2.1.5.5" --overwrite');
  console.error('  node scripts/import-config.js exports/example.xlsx "FA-MKIII" "V2.1.5.0" "MK-III" --version-to=V2.1.9.9');
  process.exit(1);
}

const name = treeName || `${model} ${version}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract numeric address from a B&R path segment like "SL2", "ST239", "IF1", "BM". */
function parseSegment(seg) {
  const m = seg.match(/^([A-Za-z]+)(\d+)?$/);
  if (!m) return { dec: null, hex: null };
  const dec = m[2] !== undefined ? parseInt(m[2], 10) : null;
  const hex = dec !== null ? dec.toString(16).toUpperCase() : null;
  return { dec, hex };
}

/**
 * B&R exports use two different formats for base modules (X20BM*):
 *
 * Pattern A — BM has a path with a trailing ".BM" segment, card follows at the
 *   parent path (e.g. BM at "SL2.IF1.ST5.BM", card at "SL2.IF1.ST5").
 *   Used in exports where B&R places the BM at a dedicated sub-address.
 *
 * Pattern B — BM and card share the exact same path (duplicate-path rows), BM
 *   appearing first (e.g. both at "IF3.ST5.IF1.ST2").
 *   Used in exports where B&R lists BM and card at the same slot address.
 *
 * In both cases the BM ends up owning the slot path/address and the actual I/O
 * card becomes a child, forcing an extra click to see what the slot really is.
 *
 * This pre-pass swaps those pairs so the real card always claims the slot path
 * and the BM is demoted to an empty-path child (attached to the card).
 * Connector rows (X20TB*) that already use an empty path are unaffected.
 */
function reorganizeRows(rows) {
  const result = [];
  let i = 0;
  while (i < rows.length) {
    const row     = rows[i];
    const pathStr = String(row[2] ?? '').trim();

    if (pathStr !== '' && pathStr !== '$root' && i + 1 < rows.length) {
      const segments = pathStr.split('.');
      const lastSeg  = segments[segments.length - 1];
      const nextRow  = rows[i + 1];
      const nextPath = String(nextRow[2] ?? '').trim();

      // Pattern A: BM at "slot.BM", card at "slot" (next row)
      if (/^BM$/i.test(lastSeg)) {
        const parentPath = segments.slice(0, -1).join('.');
        if (nextPath === parentPath) {
          result.push([nextRow[0], nextRow[1], parentPath]); // card → slot path
          result.push([row[0],     row[1],     '']);          // BM → empty-path child
          i += 2;
          continue;
        }
      }

      // Pattern B: BM at "slot", real card also at "slot" (duplicate path)
      // Identify BM by the article number (first whitespace-delimited token of col A).
      const article = String(row[0]).trim().split(/\s+/)[0];
      if (/^x20bm/i.test(article) && nextPath === pathStr) {
        result.push([nextRow[0], nextRow[1], pathStr]); // card → slot path
        result.push([row[0],     row[1],     '']);       // BM → empty-path child
        i += 2;
        continue;
      }
    }

    result.push(row);
    i++;
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const absPath = path.resolve(process.cwd(), excelFile);
  const wb      = xlsx.readFile(absPath);
  const ws      = wb.Sheets[wb.SheetNames[0]];
  const rows    = reorganizeRows(xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }));

  console.log(`Read ${rows.length} rows from: ${absPath}`);
  console.log(`Target: model="${model}" version="${version}" name="${name}"`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── Create or overwrite the tree record ───────────────────────────────────
    const [[existing]] = await conn.query(
      'SELECT id FROM hardware_trees WHERE model = ? AND software_version = ?',
      [model, version]
    );

    let treeId;
    if (existing) {
      if (!overwrite) {
        throw new Error(
          `A hardware tree for model "${model}" / version "${version}" already exists (id=${existing.id}).\n` +
          `Run with --overwrite to delete its nodes and re-import.`
        );
      }
      treeId = existing.id;
      const [del] = await conn.query('DELETE FROM hardware_nodes WHERE hardware_tree_id = ?', [treeId]);
      await conn.query('UPDATE hardware_trees SET name = ?, version_to = ? WHERE id = ?', [name, versionTo, treeId]);
      console.log(`Overwriting existing tree id=${treeId}. Deleted ${del.affectedRows} nodes.`);
    } else {
      const [r] = await conn.query(
        'INSERT INTO hardware_trees (name, model, software_version, version_to) VALUES (?, ?, ?, ?)',
        [name, model, version, versionTo]
      );
      treeId = r.insertId;
      console.log(`Created new tree id=${treeId}.`);
    }

    // ── State ─────────────────────────────────────────────────────────────────
    // pathMap: full path string → node id (tracks first-occurrence positioned nodes)
    const pathMap     = new Map();
    // posCounters: parentId (or -1 for root) → next position index
    const posCounters = new Map();
    let   rootId      = null;   // id of the $root node
    let   contextId   = null;   // last solid node (used as parent for empty-path rows)
    let   imported    = 0;
    let   skipped     = 0;
    let   placeholders = 0;

    function nextPos(parentId) {
      const key = parentId ?? -1;
      const n   = posCounters.get(key) ?? 0;
      posCounters.set(key, n + 1);
      return n;
    }

    async function insertNode({ nodeName, description, addressDec, addressHex, parentId }) {
      const [r] = await conn.query(
        `INSERT INTO hardware_nodes
           (hardware_tree_id, parent_id, name, description, address_dec, address_hex, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          treeId,
          parentId ?? null,
          String(nodeName).slice(0, 255),
          description ? String(description).slice(0, 255) : null,
          addressDec  ?? null,
          addressHex  ?? null,
          nextPos(parentId),
        ]
      );
      return r.insertId;
    }

    /**
     * Ensure every ancestor of `segments` exists in pathMap, creating
     * lightweight placeholder nodes for any that are missing.
     * Only processes up to segments.length-1 (leaves the final segment to the caller).
     */
    async function ensureAncestors(segments) {
      for (let i = 1; i < segments.length; i++) {
        const p = segments.slice(0, i).join('.');
        if (pathMap.has(p)) continue;

        const parentPath = segments.slice(0, i - 1).join('.');
        const parentId   = parentPath ? pathMap.get(parentPath) : rootId;
        const seg        = segments[i - 1];

        // IFx segments at the root level are logical interfaces of the PLC itself,
        // not physical modules. Treat them as transparent so their children attach
        // directly to root — this avoids phantom "IF3" sibling nodes alongside SL2/SL3.
        if (!parentPath && /^IF\d/i.test(seg)) {
          pathMap.set(p, rootId);
          continue;
        }

        const { dec, hex } = parseSegment(seg);

        const id = await insertNode({
          nodeName:    seg,
          description: null,
          addressDec:  dec,
          addressHex:  hex,
          parentId,
        });
        pathMap.set(p, id);
        placeholders++;
      }
    }

    // ── Process rows ──────────────────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const row     = rows[i];
      const article = String(row[0] ?? '').trim();
      const desc    = String(row[1] ?? '').trim();
      const pathStr = String(row[2] ?? '').trim();

      // Skip completely blank rows
      if (!article && !desc) { skipped++; continue; }

      const nodeName = desc || article;

      // ── $root ──────────────────────────────────────────────────────────────
      if (pathStr === '$root') {
        const id = await insertNode({
          nodeName,
          description: article || null,
          addressDec:  null,
          addressHex:  null,
          parentId:    null,
        });
        rootId    = id;
        contextId = id;
        pathMap.set('$root', id);
        imported++;
        continue;
      }

      // ── Empty path: accessory / terminal block ─────────────────────────────
      if (pathStr === '') {
        if (contextId === null) { skipped++; continue; }
        await insertNode({
          nodeName,
          description: article || null,
          addressDec:  null,
          addressHex:  null,
          parentId:    contextId,
        });
        imported++;
        continue;
      }

      // ── Positioned node ────────────────────────────────────────────────────
      if (rootId === null) {
        throw new Error(`Row ${i}: encountered positioned path "${pathStr}" before the $root row.`);
      }

      const segments = pathStr.split('.');
      const lastSeg  = segments[segments.length - 1];
      const { dec: addrDec, hex: addrHex } = parseSegment(lastSeg);

      // Ensure all intermediate ancestor nodes exist
      await ensureAncestors(segments);

      if (pathMap.has(pathStr)) {
        // Duplicate path: this module sits physically on the node already at this path.
        // Make it a child of that existing node.
        const existingId = pathMap.get(pathStr);
        const id = await insertNode({
          nodeName,
          description: article || null,
          addressDec:  null,
          addressHex:  null,
          parentId:    existingId,
        });
        contextId = id;
      } else {
        // First occurrence of this path — standard case
        const parentPath = segments.slice(0, -1).join('.');
        const parentId   = parentPath ? pathMap.get(parentPath) : rootId;
        const id = await insertNode({
          nodeName,
          description: article || null,
          addressDec:  addrDec,
          addressHex:  addrHex,
          parentId,
        });
        pathMap.set(pathStr, id);
        contextId = id;
      }
      imported++;

      if (imported % 500 === 0) {
        process.stdout.write(`  ${imported} rows processed...\r`);
      }
    }

    await conn.commit();

    console.log(`\n`);
    console.log(`Import complete:`);
    console.log(`  ${imported} nodes imported`);
    console.log(`  ${placeholders} placeholder (intermediate) nodes created`);
    console.log(`  ${skipped} rows skipped (blank)`);
    console.log(`  Tree id=${treeId}, model="${model}", version="${version}"`);
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
