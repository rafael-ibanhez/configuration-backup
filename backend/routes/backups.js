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
    // Prefix with equipmentId + timestamp to avoid name collisions
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${req.params.equipmentId}_${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
});

const router = Router();

// POST /api/backups/upload/:equipmentId
router.post('/upload/:equipmentId', upload.single('file'), async (req, res) => {
  const { equipmentId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    // Demote all previous uploads of this filename for this equipment
    await pool.query(
      'UPDATE backup_files SET is_current = 0 WHERE equipment_id = ? AND original_name = ?',
      [equipmentId, req.file.originalname]
    );

    const [result] = await pool.query(
      `INSERT INTO backup_files (equipment_id, original_name, stored_name, size_bytes, is_current)
       VALUES (?, ?, ?, ?, 1)`,
      [equipmentId, req.file.originalname, req.file.filename, req.file.size]
    );
    const [[file]] = await pool.query('SELECT * FROM backup_files WHERE id = ?', [result.insertId]);
    res.status(201).json(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups/:id/download
router.get('/:id/download', async (req, res) => {
  const { id } = req.params;
  try {
    const [[file]] = await pool.query('SELECT * FROM backup_files WHERE id = ?', [id]);
    if (!file) return res.status(404).json({ error: 'File record not found' });

    const filePath = path.join(uploadDir, file.stored_name);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    res.download(filePath, file.original_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/backups/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [[file]] = await pool.query('SELECT * FROM backup_files WHERE id = ?', [id]);
    if (!file) return res.status(404).json({ error: 'File record not found' });

    const filePath = path.join(uploadDir, file.stored_name);
    try { await unlink(filePath); } catch { /* already gone */ }

    await pool.query('DELETE FROM backup_files WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
