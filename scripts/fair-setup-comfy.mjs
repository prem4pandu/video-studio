import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand, fairWriteJson } from '../src/fair-utils.mjs';

const fairRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fairRuntime = join(fairRoot, '.fair-open');
export const fairComfyRevision = '3541246a9c997f4b8c32f9f88f3c985d02021c79';
export const fairComfyModels = [
  { repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged', revision: 'ee6f4a40737a995bf5818954cfce6d59443b0f04', file: 'diffusion_models/wan2.2_ti2v_5B_fp16.safetensors', size: 9999658848, sha256: '456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e' },
  { repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged', revision: 'ee6f4a40737a995bf5818954cfce6d59443b0f04', file: 'vae/wan2.2_vae.safetensors', size: 1409400960, sha256: 'e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156' },
  { repo: 'Comfy-Org/Wan_2.1_ComfyUI_repackaged', revision: '123acf1cc74bccbb9bfff8ac1ee72edc08c2341d', file: 'text_encoders/umt5_xxl_fp16.safetensors', size: 11366399385, sha256: '7b8850f1961e1cf8a77cca4c964a358d303f490833c6c087d0cff4b2f99db2af' },
];

async function fairSize(file) { try { return (await stat(file)).size; } catch (error) { if (error.code === 'ENOENT') return -1; throw error; } }
async function fairSha(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
async function fairRun(bin, args, cwd = fairRoot) { return fairCommand(bin, args, { cwd, timeoutMs: 2 * 60 * 60_000, onOutput: text => process.stdout.write(text) }); }

export async function fairDownloadComfyModels({ models = fairComfyModels, runtime = fairRuntime, fetchImpl = fetch, chunkSize = 64 * 1024 * 1024, workers = 8, onProgress = message => console.log(message) } = {}) {
  const work = [];
  for (const model of models) {
    const target = join(runtime, 'comfy/models', model.file);
    if (await fairSize(target) === model.size && await fairSha(target) === model.sha256) { await onProgress(`Verified ${model.file}`); continue; }
    const parts = join(runtime, 'comfy-downloads', model.sha256);
    await mkdir(parts, { recursive: true });
    const legacy = target.replace(/\.safetensors$/, '.curl-part');
    const partialSize = await fairSize(legacy);
    const partial = partialSize > 0 ? await open(legacy, 'r') : null;
    for (let start = 0; start < model.size; start += chunkSize) {
      const end = Math.min(start + chunkSize, model.size) - 1;
      const part = join(parts, String(start));
      if (await fairSize(part) === end - start + 1) continue;
      if (partial && partialSize > end) {
        const bytes = Buffer.alloc(end - start + 1);
        const read = await partial.read(bytes, 0, bytes.length, start);
        if (read.bytesRead === bytes.length) { await writeFile(part, bytes); continue; }
      }
      work.push({ model, start, end, part });
    }
    await partial?.close();
  }
  let completed = 0;
  const total = work.length;
  let failed, progressWrite = Promise.resolve();
  const progressFile = join(runtime, 'fair-comfy-download-progress.json');
  const startedAt = new Date().toISOString();
  await fairWriteJson(progressFile, { phase: 'downloading', completeChunks: 0, totalChunks: total, startedAt });
  await onProgress(`Downloading ${total} resumable model chunks from official Hugging Face repositories.`);
  const results = await Promise.allSettled(Array.from({ length: workers }, async () => {
    while (!failed && work.length) {
      const { model, start, end, part } = work.shift();
      const url = `https://huggingface.co/${model.repo}/resolve/${model.revision}/split_files/${model.file}`;
      let saved = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        try {
          const response = await fetchImpl(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(300_000) });
          if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${model.size}`) { await response.body?.cancel(); throw new Error(`Model host did not honor the requested byte range (${response.status}).`); }
          const chunks = []; let length = 0;
          for await (const chunk of response.body) { length += chunk.length; if (length > end - start + 1) throw new Error('Oversized model chunk.'); chunks.push(Buffer.from(chunk)); }
          if (length !== end - start + 1) throw new Error('Incomplete model chunk.');
          await writeFile(`${part}.tmp`, Buffer.concat(chunks));
          await rename(`${part}.tmp`, part);
          saved = true;
        } catch (error) { if (attempt === 3) { failed = error; throw error; } }
      }
      completed++;
      const snapshot = { phase: 'downloading', completeChunks: completed, totalChunks: total, startedAt, updatedAt: new Date().toISOString() };
      progressWrite = progressWrite.then(() => fairWriteJson(progressFile, snapshot));
      await progressWrite;
      await onProgress(`Model download ${completed}/${total} chunks complete.`);
    }
  }));
  const rejection = results.find(result => result.status === 'rejected');
  if (rejection) {
    await fairWriteJson(progressFile, { phase: 'failed', completeChunks: completed, totalChunks: total, startedAt, detail: rejection.reason.message });
    throw rejection.reason;
  }
  for (const model of models) {
    const target = join(runtime, 'comfy/models', model.file);
    if (await fairSize(target) === model.size && await fairSha(target) === model.sha256) continue;
    await mkdir(dirname(target), { recursive: true });
    const assembled = `${target}.assembling`;
    const handle = await open(assembled, 'w', 0o600);
    try { for (let start = 0; start < model.size; start += chunkSize) await handle.writeFile(await readFile(join(runtime, 'comfy-downloads', model.sha256, String(start)))); }
    finally { await handle.close(); }
    if (await fairSha(assembled) !== model.sha256) {
      const detail = `Checksum mismatch for ${model.file}; retained chunks for diagnosis.`;
      await fairWriteJson(progressFile, { phase: 'failed', completeChunks: completed, totalChunks: total, startedAt, detail });
      throw new Error(detail);
    }
    await rename(assembled, target);
    await onProgress(`Verified ${model.file}`);
    await rm(join(runtime, 'comfy-downloads', model.sha256), { recursive: true, force: true });
    await rm(target.replace(/\.safetensors$/, '.curl-part'), { force: true });
  }
  await fairWriteJson(join(runtime, 'fair-comfy-models.json'), { comfyRevision: fairComfyRevision, models });
  await fairWriteJson(progressFile, { phase: 'verified', completeChunks: total, totalChunks: total, startedAt, completedAt: new Date().toISOString() });
}

async function fairSetupComfy() {
  await mkdir(fairRuntime, { recursive: true });
  if (!process.argv.includes('--models-only')) {
    const checkout = join(fairRuntime, 'comfy');
    if (await fairSize(join(checkout, 'main.py')) < 0) await fairRun('git', ['clone', '--depth', '1', '--branch', 'v0.40.0', 'https://github.com/Comfy-Org/ComfyUI.git', checkout]);
    const revision = (await fairRun('git', ['rev-parse', 'HEAD'], checkout)).stdout.trim();
    if (revision !== fairComfyRevision) throw new Error('Existing local ComfyUI checkout differs from the pinned release; it was not modified.');
    const python = join(fairRuntime, 'comfy-venv/bin/python');
    if (await fairSize(python) < 0) {
      const basePython = process.env.FAIR_PYTHON_BIN || (await fairSize(join(fairRuntime, 'venv/bin/python')) > 0 ? join(fairRuntime, 'venv/bin/python') : 'python3');
      await fairRun(basePython, ['-c', 'import sys; assert sys.version_info >= (3, 12), "ComfyUI setup needs Python 3.12+. Set FAIR_PYTHON_BIN."']);
      await fairRun(basePython, ['-m', 'venv', join(fairRuntime, 'comfy-venv')]);
    }
    await fairRun(python, ['-m', 'pip', 'install', '-r', join(fairRoot, 'scripts/fair-comfy-requirements.txt')]);
  }
  await fairDownloadComfyModels();
  console.log(process.argv.includes('--models-only') ? 'Pinned Wan model files are verified. ComfyUI dependencies must also be installed before starting the worker.' : 'Pinned ComfyUI and Wan model files are installed. Run node scripts/fair-start-comfy.mjs, then validate a short render.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) fairSetupComfy().catch(error => { console.error(error.message); process.exitCode = 1; });
