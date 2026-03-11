import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const backendEnvPath = path.resolve(__dirname, '..', '..', 'backend', '.env');
  const frontendEnvPath = path.resolve(__dirname, '..', '.env');

  let port = '3000';
  try {
    const txt = await fs.readFile(backendEnvPath, 'utf8');
    const m = txt.match(/^\s*(?:PORT|BACKEND_PORT)\s*=\s*([0-9]+)\s*$/m);
    if (m) port = m[1];
  } catch (err) {
    // backend .env not found — fall back to default
  }

  const url = `http://localhost:${port}`;
  const content = `VITE_API_URL=${url}\n`;
  try {
    await fs.writeFile(frontendEnvPath, content, 'utf8');
    console.log(`Wrote VITE_API_URL=${url} to ${frontendEnvPath}`);
  } catch (err) {
    console.error('Failed to write frontend .env:', err.message);
    process.exitCode = 1;
  }
}

main();
