/**
 * Generates an Excel configuration-upload template from a hardware tree.
 *
 * Usage:
 *   node scripts/export-template.js [model] [version]
 *
 * Defaults to the first tree whose model contains "MK-III" and version contains "2.1.5.3".
 * The output file is written to: ./exports/<model>_<version>_config_template.xlsx
 */

import pool from '../db.js';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

// ── Args / defaults ────────────────────────────────────────────────────────
const modelArg   = process.argv[2] || null;
const versionArg = process.argv[3] || null;

// ── Build nested tree from flat rows ──────────────────────────────────────
function buildTree(nodes, parentId = null) {
  return nodes
    .filter(n => n.parent_id === parentId)
    .sort((a, b) => {
      if (a.address_dec === null && b.address_dec === null) return a.position - b.position;
      if (a.address_dec === null) return 1;
      if (b.address_dec === null) return -1;
      return a.address_dec - b.address_dec;
    })
    .map(n => ({ ...n, children: buildTree(nodes, n.id) }));
}

// ── Flatten nested tree to ordered rows with depth info ───────────────────
function flatten(nodes, depth = 0, parentPath = []) {
  const rows = [];
  for (const node of nodes) {
    const fullPath = [...parentPath, node.name];
    rows.push({ node, depth, fullPath });
    if (node.children?.length) {
      rows.push(...flatten(node.children, depth + 1, fullPath));
    }
  }
  return rows;
}

// ── Column widths helper for SheetJS ──────────────────────────────────────
function colWidths(ws, widths) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  try {
    // Find the tree
    let query, params;
    if (modelArg && versionArg) {
      query  = 'SELECT * FROM hardware_trees WHERE model = ? AND software_version = ? LIMIT 1';
      params = [modelArg, versionArg];
    } else {
      query  = 'SELECT * FROM hardware_trees WHERE model LIKE ? AND software_version LIKE ? LIMIT 1';
      params = ['%MK-III%', '%2.1.5.3%'];
    }

    const [[tree]] = await pool.query(query, params);
    if (!tree) {
      console.error('No hardware tree found matching the given model/version.');
      console.error('Tip: pass exact model and version as arguments:');
      console.error('  node scripts/export-template.js "MK-III" "V2.1.5.3"');
      process.exit(1);
    }

    console.log(`Found tree: "${tree.name}" — model: ${tree.model} / version: ${tree.software_version}`);

    // Fetch all nodes
    const [nodes] = await pool.query(
      'SELECT * FROM hardware_nodes WHERE hardware_tree_id = ? ORDER BY position, id',
      [tree.id]
    );

    const nested = buildTree(nodes);
    const rows   = flatten(nested);
    console.log(`  ${nodes.length} nodes found.`);

    // ── Build the workbook ─────────────────────────────────────────────────
    const wb = xlsx.utils.book_new();

    // ── Sheet 1: Configuration template ───────────────────────────────────
    const INDENT = '    '; // 4-space indent per depth level

    // Header row
    const header = [
      'Node ID',       // A – hidden reference
      'Path',          // B – full dot-path, used by import tool
      'Name',          // C – indented display name
      'Depth',         // D – numeric depth
      'Address (Dec)', // E
      'Address (Hex)', // F
      'Description',   // G
      'Value',         // H – to be filled in
      'Notes',         // I – optional operator notes
    ];

    const sheetData = [header];

    for (const { node, depth, fullPath } of rows) {
      const indent  = INDENT.repeat(depth);
      const addrDec = node.address_dec !== null ? node.address_dec : '';
      const addrHex = node.address_hex ? `0x${node.address_hex}` : '';
      sheetData.push([
        node.id,
        fullPath.join(' › '),
        indent + node.name,
        depth,
        addrDec,
        addrHex,
        node.description ?? '',
        '',   // Value — user fills in
        '',   // Notes — user fills in
      ]);
    }

    const ws = xlsx.utils.aoa_to_sheet(sheetData);

    // Column widths (chars)
    colWidths(ws, [10, 55, 40, 7, 14, 14, 40, 20, 30]);

    // Freeze the header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Hide column A (Node ID) and D (Depth) — not useful for end user
    ws['!cols'][0].hidden = true;
    ws['!cols'][3].hidden = true;

    xlsx.utils.book_append_sheet(wb, ws, 'Configuration');

    // ── Sheet 2: Tree structure (read-only reference) ──────────────────────
    const refHeader = ['Path', 'Name', 'Address (Dec)', 'Address (Hex)', 'Description'];
    const refData = [refHeader];
    for (const { node, fullPath } of rows) {
      refData.push([
        fullPath.join(' › '),
        node.name,
        node.address_dec !== null ? node.address_dec : '',
        node.address_hex ? `0x${node.address_hex}` : '',
        node.description ?? '',
      ]);
    }

    const wsRef = xlsx.utils.aoa_to_sheet(refData);
    colWidths(wsRef, [55, 35, 14, 14, 50]);
    wsRef['!freeze'] = { xSplit: 0, ySplit: 1 };
    xlsx.utils.book_append_sheet(wb, wsRef, 'Node Reference');

    // ── Sheet 3: Metadata ──────────────────────────────────────────────────
    const metaData = [
      ['Field', 'Value'],
      ['Tree name',       tree.name],
      ['Model',           tree.model],
      ['Software version', tree.software_version],
      ['Total nodes',     nodes.length],
      ['Generated at',    new Date().toISOString()],
      ['Notes',           tree.notes ?? ''],
    ];
    const wsMeta = xlsx.utils.aoa_to_sheet(metaData);
    colWidths(wsMeta, [20, 50]);
    xlsx.utils.book_append_sheet(wb, wsMeta, 'Metadata');

    // ── Write file ─────────────────────────────────────────────────────────
    const exportsDir = path.resolve(process.cwd(), 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });

    const safeName = `${tree.model}_${tree.software_version}`.replace(/[^\w.\-]/g, '_');
    const outPath  = path.join(exportsDir, `${safeName}_config_template.xlsx`);

    xlsx.writeFile(wb, outPath);
    console.log(`\nTemplate written to:\n  ${outPath}`);
  } finally {
    await pool.end();
  }
}

main();
