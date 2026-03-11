import { Router } from 'express';
import pool from '../db.js';
import { versionInRange } from '../lib/version.js';

const router = Router();

// GET /api/equipment  — list all with last backup date and current software version
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        e.*,
        (SELECT MAX(bf.uploaded_at)
           FROM backup_files bf
          WHERE bf.equipment_id = e.id) AS last_backup,
        (SELECT sv.version
           FROM software_versions sv
          WHERE sv.equipment_id = e.id
          ORDER BY sv.changed_at DESC
          LIMIT 1) AS current_version
      FROM equipment e
      ORDER BY e.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/equipment/:id  — full detail with software versions and their slots
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [[equipment]] = await pool.query(`
      SELECT
        e.*,
        (SELECT MAX(bf.uploaded_at)
           FROM backup_files bf
          WHERE bf.equipment_id = e.id) AS last_backup,
        (SELECT sv.version
           FROM software_versions sv
          WHERE sv.equipment_id = e.id
          ORDER BY sv.changed_at DESC
          LIMIT 1) AS current_version
      FROM equipment e
      WHERE e.id = ?
    `, [id]);

    if (!equipment) return res.status(404).json({ error: 'Equipment not found' });

    const [versions] = await pool.query(
      'SELECT * FROM software_versions WHERE equipment_id = ? ORDER BY changed_at DESC',
      [id]
    );
    for (const v of versions) {
      const [slots] = await pool.query(
        'SELECT * FROM slots WHERE software_version_id = ? ORDER BY position, id',
        [v.id]
      );
      v.slots = slots;
    }
    equipment.versions = versions;

    res.json(equipment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/equipment  — create
router.post('/', async (req, res) => {
  const { name, model, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO equipment (name, model, description) VALUES (?, ?, ?)',
      [name.trim(), model?.trim() || null, description?.trim() || null]
    );
    const [[eq]] = await pool.query('SELECT * FROM equipment WHERE id = ?', [result.insertId]);
    res.status(201).json(eq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/equipment/:id  — update name / description
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, model, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  try {
    await pool.query(
      'UPDATE equipment SET name = ?, model = ?, description = ? WHERE id = ?',
      [name.trim(), model?.trim() || null, description?.trim() || null, id]
    );
    const [[eq]] = await pool.query('SELECT * FROM equipment WHERE id = ?', [id]);
    res.json(eq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/equipment/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM equipment WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/equipment/:id/copy  — clone basic info into new equipment
router.post('/:id/copy', async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO equipment (name, description) VALUES (?, ?)',
      [name.trim(), description?.trim() || null]
    );
    const [[eq]] = await pool.query('SELECT * FROM equipment WHERE id = ?', [result.insertId]);
    res.status(201).json(eq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/equipment/search?version=X
// Returns { current: [...], historical: [...] }
//   current    — equipment whose latest software_version matches the query
//   historical — equipment that had a matching version in the past but no longer does
router.get('/search', async (req, res) => {
  const version = (req.query.version ?? '').trim();
  if (!version) return res.status(400).json({ error: 'version query param is required' });

  try {
    // Equipment that currently runs this version
    const [current] = await pool.query(`
      SELECT
        e.*,
        (SELECT MAX(bf.uploaded_at) FROM backup_files bf WHERE bf.equipment_id = e.id) AS last_backup,
        sv_latest.version AS current_version
      FROM equipment e
      JOIN software_versions sv_latest
        ON sv_latest.id = (
          SELECT id FROM software_versions
           WHERE equipment_id = e.id
           ORDER BY changed_at DESC
           LIMIT 1
        )
      WHERE sv_latest.version = ?
      ORDER BY e.name
    `, [version]);

    // Track which equipment ids are already in "current"
    const currentIds = new Set(current.map(e => e.id));

    // Equipment that once had this version but no longer does
    const [historical] = await pool.query(`
      SELECT DISTINCT
        e.*,
        (SELECT MAX(bf.uploaded_at) FROM backup_files bf WHERE bf.equipment_id = e.id) AS last_backup,
        (SELECT sv2.version FROM software_versions sv2
          WHERE sv2.equipment_id = e.id
          ORDER BY sv2.changed_at DESC
          LIMIT 1) AS current_version,
        (SELECT sv3.changed_at FROM software_versions sv3
          WHERE sv3.equipment_id = e.id AND sv3.version = ?
          ORDER BY sv3.changed_at DESC
          LIMIT 1) AS had_version_at
      FROM equipment e
      JOIN software_versions sv ON sv.equipment_id = e.id AND sv.version = ?
      ORDER BY e.name
    `, [version, version]);

    // Filter out any that are already in "current"
    const histFiltered = historical.filter(e => !currentIds.has(e.id));

    // Hardware trees whose version range covers the searched version
    const [allTrees] = await pool.query(
      'SELECT id, name, model, software_version, version_to FROM hardware_trees ORDER BY model, software_version'
    );
    const matchingTrees = allTrees.filter(t => versionInRange(version, t.software_version, t.version_to));

    res.json({ current, historical: histFiltered, matchingTrees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/equipment/:id/versions
router.get('/:id/versions', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM software_versions WHERE equipment_id = ? ORDER BY changed_at DESC',
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/equipment/:id/versions  — log a new software version
router.post('/:id/versions', async (req, res) => {
  const { id } = req.params;
  const { version, notes } = req.body;
  if (!version?.trim()) return res.status(400).json({ error: 'Version is required' });

  try {
    const [[current]] = await pool.query(
      'SELECT version FROM software_versions WHERE equipment_id = ? ORDER BY changed_at DESC LIMIT 1',
      [id]
    );
    const previous = current?.version ?? null;

    const [result] = await pool.query(
      'INSERT INTO software_versions (equipment_id, version, previous_version, notes) VALUES (?, ?, ?, ?)',
      [id, version.trim(), previous, notes?.trim() || null]
    );
    const [[sv]] = await pool.query('SELECT * FROM software_versions WHERE id = ?', [result.insertId]);
    res.status(201).json(sv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/equipment/:id/hardware-tree?version=X  — find matching hardware tree
router.get('/:id/hardware-tree', async (req, res) => {
  const { id } = req.params;
  const { version } = req.query;
  if (!version) return res.status(400).json({ error: 'version query param is required' });

  try {
    const [[eq]] = await pool.query('SELECT model FROM equipment WHERE id = ?', [id]);
    if (!eq) return res.status(404).json({ error: 'Equipment not found' });
    if (!eq.model) return res.json(null); // no model set → no match possible

    // Find the tree whose version range covers the requested version
    const [trees] = await pool.query(
      'SELECT id, name, model, software_version, version_to FROM hardware_trees WHERE model = ? ORDER BY software_version',
      [eq.model]
    );
    const tree = trees.find(t => versionInRange(version, t.software_version, t.version_to)) ?? null;
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/equipment/:id/backups  — grouped by original filename, current first
router.get('/:id/backups', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM backup_files
        WHERE equipment_id = ?
        ORDER BY original_name, is_current DESC, uploaded_at DESC`,
      [id]
    );
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.original_name]) grouped[row.original_name] = [];
      grouped[row.original_name].push(row);
    }
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
