import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

async function main() {
    const nodeExe = process.execPath;
    const viteCli = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js');
    const svelteKitOutput = path.join(frontendRoot, '.svelte-kit', 'output');
    const distOutput = path.join(frontendRoot, 'dist');

    // PM2 mode: serve the latest existing build only.
    if (!existsSync(svelteKitOutput) && !existsSync(distOutput)) {
        console.error('No frontend build output found. Run "npm run build" once before starting PM2 frontend.');
        process.exit(1);
    }

    const preview = spawn(nodeExe, [viteCli, 'preview', '--host', '0.0.0.0', '--port', '4173', '--strictPort'], {
        cwd: frontendRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true
    });

    preview.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    preview.stderr?.on('data', (chunk) => process.stderr.write(chunk));

    preview.on('error', (err) => {
        console.error('Failed to start Vite preview:', err.message);
        process.exit(1);
    });

    preview.on('exit', (code) => {
        process.exit(code ?? 0);
    });
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
