import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairWriteJson } from '../../src/utils.mjs';

export const OPENMONTAGE_COMMIT = '195eab24478dc9363326aec437aefc3701635ddf';
export const HYPERFRAMES_VERSION = '0.8.161';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bridge = join(root, 'studio-v2/worker/bridge.py');

export function workerPaths(env = process.env) {
  const checkout = resolve(env.STUDIO_V2_OPENMONTAGE_DIR || join(root, '.openmontage'));
  return { checkout, python: resolve(env.STUDIO_V2_PYTHON || join(checkout, '.venv/bin/python')), cli: join(root, 'node_modules/hyperframes/bin/hyperframes.mjs'), root };
}

// A separate process group owns Python, Node, Chrome and FFmpeg. Cancellation
// never interrupts another studio job or an unrelated local browser.
export function runWorkerProcess(bin, args, { env = process.env, cwd = root, signal, timeoutMs = 35 * 60_000, onLine } = {}) {
  return new Promise((resolveRun, reject) => {
    if (signal?.aborted) return reject(new Error('Generation cancelled.'));
    const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '', errors = '', pending = '', stopping = false, reason;
    const kill = sig => { try { process.platform === 'win32' ? child.kill(sig) : process.kill(-child.pid, sig); } catch {} };
    const stop = message => {
      if (stopping) return;
      stopping = true; reason = new Error(message); kill('SIGTERM');
      // Keep this timer even if the group leader exits first; children may linger.
      setTimeout(() => kill('SIGKILL'), 1500).unref();
    };
    const abort = () => stop('Generation cancelled.');
    const timer = setTimeout(() => stop('OpenMontage worker exceeded its time limit.'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      const text = String(chunk); output = (output + text).slice(-2_000_000); pending += text;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, newline); pending = pending.slice(newline + 1); onLine?.(line); }
    });
    child.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-40_000); });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(new Error(`OpenMontage worker could not start: ${error.message}`)); });
    child.on('close', code => {
      cleanup();
      if (stopping) return reject(reason);
      let data;
      try { data = output.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(value => value?.type === 'result').at(-1)?.result; } catch {}
      if (!data) return reject(new Error(`OpenMontage returned no result (exit ${code}): ${errors.slice(-1200)}`));
      resolveRun({ code, data, stderr: errors });
    });
  });
}

function bridgeArgs(operation, paths) {
  return ['-u', bridge, operation, '--checkout', paths.checkout, '--cli', paths.cli, '--node', process.execPath, '--commit', OPENMONTAGE_COMMIT, '--hyperframes-version', HYPERFRAMES_VERSION];
}

export async function workerReadiness({ env = process.env } = {}) {
  const paths = workerPaths(env);
  try {
    await Promise.all([stat(paths.python), stat(join(paths.checkout, 'LICENSE')), stat(paths.cli)]);
    const result = await runWorkerProcess(paths.python, bridgeArgs('preflight', paths), { env, timeoutMs: 45_000 });
    return { available: result.code === 0 && result.data.success === true, detail: result.data.success ? 'Pinned OpenMontage + HyperFrames local renderer ready.' : result.data.error, version: OPENMONTAGE_COMMIT, provenance: result.data.provenance, checks: result.data.checks };
  } catch (error) {
    return { available: false, detail: `OpenMontage is unavailable. Run npm run setup:studio-v2. ${error.message}`, version: OPENMONTAGE_COMMIT };
  }
}

export async function renderWithOpenMontage(workspace, outputFile, { env = process.env, signal, onProgress } = {}) {
  const paths = workerPaths(env), directory = resolve(workspace), output = resolve(outputFile);
  await mkdir(dirname(output), { recursive: true });
  await readFile(join(directory, 'index.html'), 'utf8');
  const logFile = join(directory, 'openmontage-worker.log');
  let writes = Promise.resolve();
  const timeout = Number(env.STUDIO_V2_RENDER_TIMEOUT_MS || 35 * 60_000);
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 2 * 60 * 60_000) throw new Error('STUDIO_V2_RENDER_TIMEOUT_MS must be between 1000 and 7200000.');
  const result = await runWorkerProcess(paths.python, [...bridgeArgs('render', paths), '--workspace', directory, '--output', output], {
    env, signal, timeoutMs: timeout,
    onLine: line => {
      let event;
      try { event = JSON.parse(line); } catch {}
      writes = writes.then(async () => {
        await appendFile(logFile, `${line}\n`);
        if (event?.type === 'progress') await onProgress?.({ stage: 'render', progress: event.progress, message: event.message });
      });
    },
  }).finally(() => writes);
  await fairWriteJson(join(directory, 'openmontage-result.json'), result.data);
  if (result.code !== 0 || !result.data.success) throw new Error(result.data.error || `OpenMontage render failed (exit ${result.code}).`);
  const file = await stat(output);
  if (!file.isFile() || file.size < 1000) throw new Error('OpenMontage reported success without a usable output video.');
  return { ...result.data, output, bytes: file.size };
}
