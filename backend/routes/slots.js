import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `slot_${req.params.id}_${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

const router = Router();

// POST /api/slots
router.post('/', async (req, res) => {
  const { software_version_id, name } = req.body;
  if (!software_version_id || !name?.trim())
    return res.status(400).json({ error: 'software_version_id and name are required' });

  try {
    const [[m]] = await pool.query(
      'SELECT COALESCE(MAX(position), 0) AS maxpos FROM slots WHERE software_version_id = ?',
      [software_version_id]
    );
    const pos = (m?.maxpos ?? 0) + 1;
    const [result] = await pool.query(
      'INSERT INTO slots (software_version_id, name, position) VALUES (?, ?, ?)',
      [software_version_id, name.trim(), pos]
    );
    const [[slot]] = await pool.query('SELECT * FROM slots WHERE id = ?', [result.insertId]);
    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/slots/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, position } = req.body;
  try {
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (position !== undefined) { updates.push('position = ?'); params.push(position); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    await pool.query(`UPDATE slots SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
    const [[slot]] = await pool.query('SELECT * FROM slots WHERE id = ?', [id]);
    res.json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/slots/:id/image  — upload / replace slot image
router.post('/:id/image', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    // Delete old image file if one exists
    const [[existing]] = await pool.query(
      'SELECT image_stored_name FROM slots WHERE id = ?', [id]
    );
    if (existing?.image_stored_name) {
      const oldPath = path.join(uploadDir, existing.image_stored_name);
      try { await unlink(oldPath); } catch { /* already gone */ }
    }

    await pool.query(
      'UPDATE slots SET image_original_name = ?, image_stored_name = ? WHERE id = ?',
      [req.file.originalname, req.file.filename, id]
    );
    const [[slot]] = await pool.query('SELECT * FROM slots WHERE id = ?', [id]);
    res.json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/slots/:id/image  — serve slot image inline
router.get('/:id/image', async (req, res) => {
  const { id } = req.params;
  try {
    const [[slot]] = await pool.query('SELECT * FROM slots WHERE id = ?', [id]);
    if (!slot?.image_stored_name) return res.status(404).json({ error: 'No image' });
    const filePath = path.join(uploadDir, slot.image_stored_name);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Image file not found' });
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/slots/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [[slot]] = await pool.query('SELECT * FROM slots WHERE id = ?', [id]);
    if (slot?.image_stored_name) {
      const fp = path.join(uploadDir, slot.image_stored_name);
      try { await unlink(fp); } catch { /* already gone */ }
    }
    await pool.query('DELETE FROM slots WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
