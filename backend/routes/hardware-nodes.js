import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// POST /api/hardware-nodes  — create a node (slot or child)
router.post('/', async (req, res) => {
  const { hardware_tree_id, parent_id, name, description, address_dec, address_hex } = req.body;
  if (!hardware_tree_id || !name?.trim())
    return res.status(400).json({ error: 'hardware_tree_id and name are required' });

  const isRoot = parent_id === null || parent_id === undefined;
  if (isRoot && (address_dec === null || address_dec === undefined || address_dec === ''))
    return res.status(400).json({ error: 'Top-level slots require a decimal address' });

  // Normalise values
  const decVal = (address_dec !== null && address_dec !== undefined && address_dec !== '')
    ? parseInt(address_dec, 10) : null;
  const hexVal = address_hex?.trim() || null;

  try {
    // Get next position among siblings
    const [[m]] = await pool.query(
      'SELECT COALESCE(MAX(position), 0) AS maxpos FROM hardware_nodes WHERE hardware_tree_id = ? AND parent_id <=> ?',
      [hardware_tree_id, parent_id ?? null]
    );
    const pos = (m?.maxpos ?? 0) + 1;

    const [result] = await pool.query(
      `INSERT INTO hardware_nodes
         (hardware_tree_id, parent_id, name, description, address_dec, address_hex, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [hardware_tree_id, parent_id ?? null, name.trim(),
        description?.trim() || null, decVal, hexVal, pos]
    );
    const [[node]] = await pool.query('SELECT * FROM hardware_nodes WHERE id = ?', [result.insertId]);
    res.status(201).json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/hardware-nodes/:id  — update
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, address_dec, address_hex, position } = req.body;

  try {
    const [[node]] = await pool.query('SELECT * FROM hardware_nodes WHERE id = ?', [id]);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    // Root node must keep an address
    if (node.parent_id === null) {
      const newDec = address_dec !== undefined ? address_dec : node.address_dec;
      if (newDec === null || newDec === undefined || newDec === '')
        return res.status(400).json({ error: 'Top-level slots require a decimal address' });
    }

    const updates = [];
    const params = [];
    if (name !== undefined)        { updates.push('name = ?');        params.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description?.trim() || null); }
    if (address_dec !== undefined) {
      updates.push('address_dec = ?');
      params.push((address_dec !== '' && address_dec !== null) ? parseInt(address_dec, 10) : null);
    }
    if (address_hex !== undefined) { updates.push('address_hex = ?'); params.push(address_hex?.trim() || null); }
    if (position !== undefined)    { updates.push('position = ?');    params.push(position); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    await pool.query(`UPDATE hardware_nodes SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
    const [[updated]] = await pool.query('SELECT * FROM hardware_nodes WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hardware-nodes/:id  — cascades to children via FK
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM hardware_nodes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
