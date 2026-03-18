import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import equipmentRouter from './routes/equipment.js';
import slotsRouter from './routes/slots.js';
import backupsRouter from './routes/backups.js';
import hardwareTreesRouter from './routes/hardware-trees.js';
import hardwareNodesRouter from './routes/hardware-nodes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.BACKEND_HOST || '0.0.0.0';
const allowLanOrigins = String(process.env.ALLOW_LAN_ORIGINS || '').toLowerCase() === 'true';
const configuredOrigins = new Set(
  String(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function isLocalhostOrigin(origin) {
  return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
}

function isLanOrigin(origin) {
  return /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin);
}

function isHttpOrigin(origin) {
  return /^https?:\/\//i.test(origin);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-side) with no origin
    if (!origin) return callback(null, true);
    // Allow any localhost origin (covers Vite dev/preview ports)
    if (isLocalhostOrigin(origin)) return callback(null, true);
    // Allow explicitly configured origins (comma-separated in FRONTEND_ORIGIN)
    if (configuredOrigins.has(origin)) return callback(null, true);
    // Optional remote-origin support (LAN / hostname access) when enabled in env
    if (allowLanOrigins && (isLanOrigin(origin) || isHttpOrigin(origin))) return callback(null, true);
    // Reject others
    return callback(new Error('CORS origin denied'));
  }
}));
app.use(express.json());

app.use('/api/equipment', equipmentRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/hardware-trees', hardwareTreesRouter);
app.use('/api/hardware-nodes', hardwareNodesRouter);

app.listen(PORT, HOST, () => {
  console.log(`Backend running at http://${HOST}:${PORT}`);
});
