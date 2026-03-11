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

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-side) with no origin
    if (!origin) return callback(null, true);
    // Allow any localhost origin (covers Vite dev/preview ports)
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return callback(null, true);
    // Fallback to explicit env var if set
    if (process.env.FRONTEND_ORIGIN && origin === process.env.FRONTEND_ORIGIN) return callback(null, true);
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

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
