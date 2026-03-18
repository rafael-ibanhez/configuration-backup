import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Build nested tree from flat node array
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

// GET /api/hardware-trees  — list all
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        ht.id,
        ht.name,
        ht.model,
        ht.software_version,
        ht.version_to,
        ht.notes,
        ht.created_at,
        (SELECT COUNT(*)
           FROM hardware_nodes hn
          WHERE hn.hardware_tree_id = ht.id
            AND hn.parent_id IS NULL) AS slot_count
      FROM hardware_trees ht
      ORDER BY ht.model, ht.software_version
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hardware-trees/compare?model=X&from_version=A&to_version=B
router.get('/compare', async (req, res) => {
  const { model, from_version, to_version } = req.query;
  if (!model?.trim())        return res.status(400).json({ error: 'model is required' });
  if (!from_version?.trim()) return res.status(400).json({ error: 'from_version is required' });
  if (!to_version?.trim())   return res.status(400).json({ error: 'to_version is required' });

  try {
    // Load both trees (may be null if not found)
    const [[fromTree]] = await pool.query(
      'SELECT * FROM hardware_trees WHERE model = ? AND software_version = ?',
      [model.trim(), from_version.trim()]
    );
    const [[toTree]] = await pool.query(
      'SELECT * FROM hardware_trees WHERE model = ? AND software_version = ?',
      [model.trim(), to_version.trim()]
    );

    const fromNodes = fromTree
      ? (await pool.query('SELECT * FROM hardware_nodes WHERE hardware_tree_id = ? ORDER BY position, id', [fromTree.id]))[0]
      : [];
    const toNodes = toTree
      ? (await pool.query('SELECT * FROM hardware_nodes WHERE hardware_tree_id = ? ORDER BY position, id', [toTree.id]))[0]
      : [];

    if (fromTree) fromTree.nodes = buildTree(fromNodes);
    if (toTree)   toTree.nodes   = buildTree(toNodes);

    // ── Diff helpers ────────────────────────────────────────────────────────
    function fmtAddr(dec, hex) {
      if (dec !== null && hex)  return `${dec} / 0x${hex}`;
      if (dec !== null)         return String(dec);
      if (hex)                  return `0x${hex}`;
      return null;
    }

    // Unique instance label: in B&R imports, the instance name is always
    // identifier-like (no spaces), while the hardware type description has spaces.
    // This heuristic picks the right field regardless of which column was imported as name vs description.
    function instanceLabel(n) {
      if (!n.description) return n.name;
      if (!n.name) return n.description;
      const nameSpaces = (n.name.match(/ /g) || []).length;
      const descSpaces = (n.description.match(/ /g) || []).length;
      return nameSpaces <= descSpaces ? n.name : n.description;
    }

    // IO entries (created by import-io.js) have descriptions starting with "AT %".
    function isIOEntry(n) {
      return typeof n.description === 'string' && n.description.startsWith('AT %');
    }

    // Stable key used for MATCHING during comparison.
    // IO entries: keyed by channel (description = "AT %IX.DigitalInput02") — the physical
    // address is stable, while variable names change between software versions.
    // Hardware nodes: keyed by the identifier-like instance name.
    function nodeKey(n) {
      if (isIOEntry(n)) return n.description;
      return instanceLabel(n);
    }

    // Human-readable label for DISPLAY in path keys and diff output.
    // IO entries: show the variable name (the interesting part).
    // Hardware nodes: show the instance label.
    function nodeLabel(n) {
      if (isIOEntry(n)) return n.name || n.description;
      return instanceLabel(n);
    }
    function pathLabels(nodeArr) { return nodeArr.map(nodeLabel); }

    // Flatten the entire TO tree so we can do a global name search for move detection.
    function flattenTree(nodes, pathSoFar = []) {
      return nodes.flatMap(node => {
        const path = [...pathSoFar, node];
        return [{ node, path }, ...flattenTree(node.children ?? [], path)];
      });
    }

    // Collect a node + all its descendants into removed / added bucket.
    function collectSubtree(node, parentPath, bucket, skipIds) {
      if (skipIds?.has(node.id)) return;
      const path = [...parentPath, node];
      bucket.push({ pathKey: pathLabels(path).join(' \u203a '), path: pathLabels(path), node });
      for (const child of node.children ?? []) collectSubtree(child, path, bucket, skipIds);
    }

    function compareProps(a, b) {
      const changes = [];
      const aAddr = fmtAddr(a.address_dec, a.address_hex);
      const bAddr = fmtAddr(b.address_dec, b.address_hex);
      if (aAddr !== bAddr)
        changes.push({ field: 'address', from: aAddr, to: bAddr });
      if (a.name !== b.name) {
        // For IO entries, a name change means the software variable was renamed.
        const field = isIOEntry(a) ? 'variable' : 'name';
        changes.push({ field, from: a.name, to: b.name });
      }
      // For IO entries the description IS the channel (the matching key), so it never
      // changes between a matched pair. Only emit 'article' for hardware nodes.
      if (!isIOEntry(a) && (a.description ?? '') !== (b.description ?? ''))
        changes.push({ field: 'article', from: a.description, to: b.description });
      return changes;
    }

    // Recursive address-first diff.
    // At each parent level: match children by address_dec.
    // Unmatched FROM address → global description search in TO (move detection).
    // Unmatched TO address → ADDED.
    // Nodes without address → matched by description/name within the same parent.
    function diffLevel(fromNodes, toNodes, fromPath, toPath, removed, added, modified, toFlat, usedToIds) {
      // Build address buckets — multiple siblings may share the same address_dec
      // (e.g. an "IF1" placeholder and the real module "X20IF1091-1" are both
      // stored at address 1). Collect in insertion order and match positionally
      // so neither is silently dropped by a Map overwrite.
      const fromByAddr = new Map();
      const fromNoAddr = [];
      for (const n of fromNodes) {
        if (n.address_dec !== null) {
          if (!fromByAddr.has(n.address_dec)) fromByAddr.set(n.address_dec, []);
          fromByAddr.get(n.address_dec).push(n);
        } else {
          fromNoAddr.push(n);
        }
      }
      const toByAddr = new Map();
      const toNoAddr = [];
      for (const n of toNodes) {
        if (n.address_dec !== null) {
          if (!toByAddr.has(n.address_dec)) toByAddr.set(n.address_dec, []);
          toByAddr.get(n.address_dec).push(n);
        } else {
          toNoAddr.push(n);
        }
      }

      // ── Step 1: addressed nodes — match positionally within each address bucket ──
      for (const [addr, fromBucket] of fromByAddr) {
        const toBucket = toByAddr.get(addr) ?? [];
        for (let i = 0; i < fromBucket.length; i++) {
          const fromNode = fromBucket[i];
          const toNode   = toBucket[i] ?? null;
          if (toNode) {
            // Same address at same position in both → compare, recurse
            usedToIds.add(toNode.id);
            const fpFull  = [...fromPath, fromNode];
            const tpFull  = [...toPath,   toNode];
            const changes = compareProps(fromNode, toNode);
            if (changes.length) {
              modified.push({
                pathKey:   pathLabels(fpFull).join(' \u203a '),
                toPathKey: pathLabels(tpFull).join(' \u203a '),
                path:      pathLabels(fpFull),
                changes, fromNode, toNode, moved: false,
              });
            }
            diffLevel(fromNode.children ?? [], toNode.children ?? [], fpFull, tpFull, removed, added, modified, toFlat, usedToIds);
          } else {
            // No positional match — search the entire TO tree by instance key (moved?)
            const fromKey = nodeKey(fromNode);
            const matchEntry = fromKey
              ? toFlat.find(({ node: n }) => !usedToIds.has(n.id) && nodeKey(n) === fromKey)
              : null;
            if (matchEntry) {
              usedToIds.add(matchEntry.node.id);
              const toNode  = matchEntry.node;
              const fpFull  = [...fromPath, fromNode];
              const tpFull  = matchEntry.path;
              const changes = [];
              const fa = fmtAddr(fromNode.address_dec, fromNode.address_hex);
              const ta = fmtAddr(toNode.address_dec,   toNode.address_hex);
              if (fa !== ta) changes.push({ field: 'address', from: fa, to: ta });
              if (fromNode.name !== toNode.name) changes.push({ field: 'name', from: fromNode.name, to: toNode.name });
              const fromParent = pathLabels(fromPath).join(' \u203a ') || '(root)';
              const toParent   = pathLabels(tpFull.slice(0, -1)).join(' \u203a ') || '(root)';
              if (fromParent !== toParent) changes.push({ field: 'location', from: fromParent, to: toParent });
              modified.push({
                pathKey:   pathLabels(fpFull).join(' \u203a '),
                toPathKey: pathLabels(tpFull).join(' \u203a '),
                path:      pathLabels(fpFull),
                changes, fromNode, toNode, moved: true,
              });
              diffLevel(fromNode.children ?? [], toNode.children ?? [], fpFull, tpFull, removed, added, modified, toFlat, usedToIds);
            } else {
              collectSubtree(fromNode, fromPath, removed, null);
            }
          }
        }
      }

      // ── Step 2: TO addressed nodes not claimed → ADDED ──────────────────
      for (const [, toBucket] of toByAddr) {
        for (const toNode of toBucket) {
          if (!usedToIds.has(toNode.id)) collectSubtree(toNode, toPath, added, usedToIds);
        }
      }

      // ── Step 3: unaddressed nodes — match by stable key ─────────────────
      // Hardware nodes → instance label; IO entries → channel (description).
      //
      // Multiple nodes may legitimately share the same key (several PLC variables
      // can read/write the same physical channel, e.g. "AT %IB.SDC_LifeCnt").
      // We match positionally within each key group: 1st-from ↔ 1st-to,
      // 2nd-from ↔ 2nd-to, etc.  Excess entries on either side → removed/added.
      const toNoAddrByKey = new Map();
      for (const n of toNoAddr) {
        if (usedToIds.has(n.id)) continue;
        const k = nodeKey(n);
        if (!toNoAddrByKey.has(k)) toNoAddrByKey.set(k, []);
        toNoAddrByKey.get(k).push(n);
      }
      const toNoAddrIdx = new Map(); // key → next positional index to consume
      for (const fromNode of fromNoAddr) {
        const k        = nodeKey(fromNode);
        const bucket   = toNoAddrByKey.get(k);
        const idx      = toNoAddrIdx.get(k) ?? 0;
        const toNode   = bucket?.[idx] ?? null;
        if (toNode) {
          toNoAddrIdx.set(k, idx + 1);
          usedToIds.add(toNode.id);
          const fpFull  = [...fromPath, fromNode];
          const tpFull  = [...toPath,   toNode];
          const changes = compareProps(fromNode, toNode);
          if (changes.length) {
            modified.push({
              pathKey:   pathLabels(fpFull).join(' \u203a '),
              toPathKey: pathLabels(tpFull).join(' \u203a '),
              path:      pathLabels(fpFull),
              changes, fromNode, toNode, moved: false,
            });
          }
          diffLevel(fromNode.children ?? [], toNode.children ?? [], fpFull, tpFull, removed, added, modified, toFlat, usedToIds);
        } else {
          collectSubtree(fromNode, fromPath, removed, null);
        }
      }
      for (const toNode of toNoAddr) {
        if (!usedToIds.has(toNode.id)) collectSubtree(toNode, toPath, added, usedToIds);
      }
    }

    // ── Run the diff ────────────────────────────────────────────────────────
    const toGlobalFlat = toTree ? flattenTree(toTree.nodes) : [];
    const usedToIds    = new Set();
    const removed      = [];
    const added        = [];
    const modified     = [];

    diffLevel(
      fromTree?.nodes ?? [], toTree?.nodes ?? [],
      [], [],
      removed, added, modified,
      toGlobalFlat, usedToIds,
    );

    res.json({
      from: fromTree ?? null,
      to:   toTree   ?? null,
      diff: { removed, added, modified },
      summary: {
        removed_count:  removed.length,
        added_count:    added.length,
        modified_count: modified.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hardware-trees/:id  — full tree with nested nodes
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [[tree]] = await pool.query(
      'SELECT * FROM hardware_trees WHERE id = ?',
      [id]
    );
    if (!tree) return res.status(404).json({ error: 'Hardware tree not found' });

    const [nodes] = await pool.query(
      'SELECT * FROM hardware_nodes WHERE hardware_tree_id = ? ORDER BY position, id',
      [id]
    );
    tree.nodes = buildTree(nodes);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hardware-trees  — create
router.post('/', async (req, res) => {
  const { name, model, software_version, version_to, notes } = req.body;
  if (!name?.trim())             return res.status(400).json({ error: 'name is required' });
  if (!model?.trim())            return res.status(400).json({ error: 'model is required' });
  if (!software_version?.trim()) return res.status(400).json({ error: 'software_version is required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO hardware_trees (name, model, software_version, version_to, notes) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), model.trim(), software_version.trim(), version_to?.trim() || null, notes?.trim() || null]
    );
    const [[tree]] = await pool.query('SELECT * FROM hardware_trees WHERE id = ?', [result.insertId]);
    tree.nodes = [];
    res.status(201).json(tree);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const [[existing]] = await pool.query(
        'SELECT id FROM hardware_trees WHERE model = ? AND software_version = ?',
        [model.trim(), software_version.trim()]
      );
      return res.status(409).json({
        error: `A hardware tree for model "${model.trim()}" / version "${software_version.trim()}" already exists`,
        existingId: existing?.id,
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/hardware-trees/:id  — update metadata
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, model, software_version, version_to, notes } = req.body;

  try {
    const updates = [];
    const params = [];
    if (name !== undefined)             { updates.push('name = ?');             params.push(name.trim()); }
    if (model !== undefined)            { updates.push('model = ?');            params.push(model.trim()); }
    if (software_version !== undefined) { updates.push('software_version = ?'); params.push(software_version.trim()); }
    if (version_to !== undefined)       { updates.push('version_to = ?');       params.push(version_to?.trim() || null); }
    if (notes !== undefined)            { updates.push('notes = ?');            params.push(notes?.trim() || null); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    await pool.query(`UPDATE hardware_trees SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
    const [[tree]] = await pool.query('SELECT * FROM hardware_trees WHERE id = ?', [id]);
    res.json(tree);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A hardware tree for this model + version already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hardware-trees/:id
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM hardware_trees WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hardware-trees/:id/copy  — duplicate to a different model/version
router.post('/:id/copy', async (req, res) => {
  const { name, model, software_version, version_to, notes } = req.body;
  if (!name?.trim())             return res.status(400).json({ error: 'name is required' });
  if (!model?.trim())            return res.status(400).json({ error: 'model is required' });
  if (!software_version?.trim()) return res.status(400).json({ error: 'software_version is required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [treeResult] = await conn.query(
      'INSERT INTO hardware_trees (name, model, software_version, version_to, notes) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), model.trim(), software_version.trim(), version_to?.trim() || null, notes?.trim() || null]
    );
    const newTreeId = treeResult.insertId;

    const [srcNodes] = await conn.query(
      'SELECT * FROM hardware_nodes WHERE hardware_tree_id = ? ORDER BY id',
      [req.params.id]
    );

    const cloneNode = async (node, newParentId) => {
      const [r] = await conn.query(
        `INSERT INTO hardware_nodes
           (hardware_tree_id, parent_id, name, description, address_dec, address_hex, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newTreeId, newParentId, node.name, node.description,
          node.address_dec, node.address_hex, node.position]
      );
      for (const child of srcNodes.filter(n => n.parent_id === node.id)) {
        await cloneNode(child, r.insertId);
      }
    };

    for (const root of srcNodes.filter(n => n.parent_id === null)) {
      await cloneNode(root, null);
    }

    await conn.commit();

    const [[tree]] = await pool.query('SELECT * FROM hardware_trees WHERE id = ?', [newTreeId]);
    const [newNodes] = await pool.query(
      'SELECT * FROM hardware_nodes WHERE hardware_tree_id = ? ORDER BY position, id',
      [newTreeId]
    );
    tree.nodes = buildTree(newNodes);
    res.status(201).json(tree);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: `A hardware tree for model "${model.trim()}" / version "${software_version.trim()}" already exists`,
      });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

export default router;
