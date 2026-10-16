import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const fairHash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export async function fairFileHash(file) { return fairHash(await readFile(file)); }
export async function fairReadJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
export async function fairWriteJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}
export function fairEscape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function fairCommand(bin, args, { cwd, signal, timeoutMs = 120_000, onOutput, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Generation cancelled.'));
    const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let stdout = '', stderr = '', stopped = false, killTimer;
    const stop = () => {
      stopped = true;
      try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
      killTimer = setTimeout(() => {
        try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {}
      }, 3000);
      killTimer.unref();
    };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', stop); };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-500_000); onOutput?.(String(chunk)); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-100_000); onOutput?.(String(chunk)); });
    child.on('error', error => { cleanup(); reject(new Error(`${bin}: ${error.message}`)); });
    child.on('close', code => {
      cleanup();
      if (stopped) reject(new Error(signal?.aborted ? 'Generation cancelled.' : `${bin} exceeded its time limit.`));
      else if (code !== 0) reject(new Error(`${bin} exited ${code}: ${(stderr || stdout).slice(-3500)}`));
      else resolve({ stdout, stderr });
    });
  });
}

export function fairTimestamp(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  return `${String(Math.floor(milliseconds / 3_600_000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60_000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}
