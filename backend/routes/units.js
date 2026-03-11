import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// POST /api/units
router.post('/units', async (req, res) => {
  const { equipment_id, name } = req.body;
  if (!equipment_id || !name?.trim())
    return res.status(400).json({ error: 'equipment_id and name are required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO units (equipment_id, name) VALUES (?, ?)',
      [equipment_id, name.trim()]
    );
    const [[unit]] = await pool.query('SELECT * FROM units WHERE id = ?', [result.insertId]);
    unit.options = [];
    res.status(201).json(unit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/units/:id
router.put('/units/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  try {
    await pool.query('UPDATE units SET name = ? WHERE id = ?', [name.trim(), id]);
    const [[unit]] = await pool.query('SELECT * FROM units WHERE id = ?', [id]);
    res.json(unit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/units/:id
router.delete('/units/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM units WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/options
router.post('/options', async (req, res) => {
  const { unit_id, option_key, option_value } = req.body;
  if (!unit_id || !option_key?.trim())
    return res.status(400).json({ error: 'unit_id and option_key are required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO unit_options (unit_id, option_key, option_value) VALUES (?, ?, ?)',
      [unit_id, option_key.trim(), option_value?.trim() ?? null]
    );
    const [[opt]] = await pool.query('SELECT * FROM unit_options WHERE id = ?', [result.insertId]);
    res.status(201).json(opt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/options/:id
router.put('/options/:id', async (req, res) => {
  const { id } = req.params;
  const { option_key, option_value } = req.body;
  if (!option_key?.trim()) return res.status(400).json({ error: 'option_key is required' });

  try {
    await pool.query(
      'UPDATE unit_options SET option_key = ?, option_value = ? WHERE id = ?',
      [option_key.trim(), option_value?.trim() ?? null, id]
    );
    const [[opt]] = await pool.query('SELECT * FROM unit_options WHERE id = ?', [id]);
    res.json(opt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/options/:id
router.delete('/options/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM unit_options WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/unit-names — all distinct unit names
router.get('/unit-names', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT name FROM units ORDER BY name');
    res.json(rows.map((r) => r.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/option-keys?unit=<name> — distinct option keys for a given unit name
router.get('/option-keys', async (req, res) => {
  const { unit } = req.query;
  if (!unit) return res.status(400).json({ error: 'unit query param required' });
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT uo.option_key
       FROM unit_options uo
       JOIN units u ON uo.unit_id = u.id
       WHERE u.name = ?
       ORDER BY uo.option_key`,
      [unit]
    );
    res.json(rows.map((r) => r.option_key));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/option-values?unit=<name>&key=<key> — distinct values for a unit+key combo
router.get('/option-values', async (req, res) => {
  const { unit, key } = req.query;
  if (!unit || !key) return res.status(400).json({ error: 'unit and key query params required' });
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT uo.option_value
       FROM unit_options uo
       JOIN units u ON uo.unit_id = u.id
       WHERE u.name = ? AND uo.option_key = ?
         AND uo.option_value IS NOT NULL AND uo.option_value != ''
       ORDER BY uo.option_value`,
      [unit, key]
    );
    res.json(rows.map((r) => r.option_value));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Slots endpoints ───────────────────────────────────────────────────────────

// POST /api/slots
router.post('/slots', async (req, res) => {
  const { equipment_id, name, unit_id } = req.body;
  if (!equipment_id || !name?.trim())
    return res.status(400).json({ error: 'equipment_id and name are required' });

  try {
    const [[m]] = await pool.query(
      'SELECT COALESCE(MAX(position), 0) AS maxpos FROM slots WHERE equipment_id = ?',
      [equipment_id]
    );
    const pos = (m?.maxpos ?? 0) + 1;
    const [result] = await pool.query(
      'INSERT INTO slots (equipment_id, name, unit_id, position) VALUES (?, ?, ?, ?)',
      [equipment_id, name.trim(), unit_id || null, pos]
    );
    const [[slot]] = await pool.query('SELECT * FROM slots WHERE id = ?', [result.insertId]);
    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/slots/:id
router.put('/slots/:id', async (req, res) => {
  const { id } = req.params;
  const { name, unit_id, position } = req.body;
  try {
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name?.trim() ?? ''); }
    if (unit_id !== undefined) { updates.push('unit_id = ?'); params.push(unit_id || null); }
    if (position !== undefined) { updates.push('position = ?'); params.push(position); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    await pool.query(`UPDATE slots SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
    const [[slot]] = await pool.query('SELECT * FROM slots WHERE id = ?', [id]);
    res.json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/slots/by-equipment/:equipmentId — MUST be before DELETE /slots/:id
router.delete('/slots/by-equipment/:equipmentId', async (req, res) => {
  const { equipmentId } = req.params;
  try {
    await pool.query('DELETE FROM slots WHERE equipment_id = ?', [equipmentId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/slots/:id
router.delete('/slots/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM slots WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
