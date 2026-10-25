import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as fairDelay } from 'node:timers/promises';
import { fairHash, fairReadJson, fairWriteJson } from './utils.mjs';

// Independently authored API graph using ComfyUI's documented built-in interfaces:
// https://docs.comfy.org/tutorials/video/wan/wan2_2 (Wan models: Apache-2.0; ComfyUI: GPL-3.0).
const fairWanModel = 'wan2.2_ti2v_5B_fp16.safetensors';
const fairWanEncoder = 'umt5_xxl_fp16.safetensors';
const fairWanVae = 'wan2.2_vae.safetensors';
const fairWanMaxBytes = 256 * 1024 * 1024;
const fairWanJobs = new Map();

function fairWanConfig(env) {
  const url = new URL(env.FAIR_COMFYUI_URL || 'http://127.0.0.1:8188');
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('FAIR_COMFYUI_URL must be a loopback HTTP origin (127.0.0.1 or [::1]); use an SSH tunnel for a remote GPU.');
  }
  if (env.FAIR_WAN_WORKFLOW) throw new Error('Custom Wan workflows are unsupported; this version uses the bundled built-in-node graph.');
  const models = [env.FAIR_WAN_MODEL || fairWanModel, env.FAIR_WAN_TEXT_ENCODER || fairWanEncoder, env.FAIR_WAN_VAE || fairWanVae];
  for (const model of models) if (!/^[A-Za-z0-9_./-]+\.safetensors$/.test(model) || model.startsWith('/') || model.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid Wan model filename.');
  const integer = (name, fallback, min, max, multiple = 1, offset = 0) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max || (value - offset) % multiple !== 0) throw new Error(`${name} is outside the supported Wan range.`);
    return value;
  };
  const width = integer('FAIR_WAN_WIDTH', 512, 256, 1280, 32);
  const height = integer('FAIR_WAN_HEIGHT', 288, 256, 704, 32);
  const frames = integer('FAIR_WAN_FRAMES', 41, 17, 121, 4, 1);
  const steps = integer('FAIR_WAN_STEPS', 20, 4, 30);
  const fps = integer('FAIR_WAN_FPS', 8, 8, 30);
  const textDevice = env.FAIR_WAN_TEXT_DEVICE || 'cpu';
  if (!['default', 'cpu'].includes(textDevice)) throw new Error('FAIR_WAN_TEXT_DEVICE must be default or cpu.');
  return { origin: url.origin, models, width, height, frames, steps, fps, textDevice };
}

export function fairWanWorkflow({ prompt = '', env = process.env, modernVideo = false } = {}) {
  const { models: [model, encoder, vae], width, height, frames, steps, fps, textDevice } = fairWanConfig(env);
  const node = (class_type, inputs) => ({ class_type, inputs });
  return {
    '1': node('UNETLoader', { unet_name: model, weight_dtype: 'default' }),
    '2': node('CLIPLoader', { clip_name: encoder, type: 'wan', device: textDevice }),
    '3': node('VAELoader', { vae_name: vae }),
    '4': node('CLIPTextEncode', { text: prompt, clip: ['2', 0] }),
    '5': node('CLIPTextEncode', { text: 'text, letters, numerals, captions, watermark, distorted anatomy, blurry, flashing lights', clip: ['2', 0] }),
    '6': node('ModelSamplingSD3', { model: ['1', 0], shift: 8 }),
    '7': node('Wan22ImageToVideoLatent', { vae: ['3', 0], width, height, length: frames, batch_size: 1 }),
    // uni_pc diverges on Apple Silicon MPS past ~5 latent frames (ComfyUI issue
    // #15921, reproduced on M5 Pro); euler is verified clean at every length.
    '8': node('KSampler', { model: ['6', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['7', 0], seed: Number.parseInt(fairHash(prompt).slice(0, 12), 16), steps, cfg: 5, sampler_name: 'euler', scheduler: 'simple', denoise: 1 }),
    '9': node('VAEDecode', { samples: ['8', 0], vae: ['3', 0] }),
    '10': node('CreateVideo', { images: ['9', 0], fps }),
    '11': node('SaveVideo', { video: ['10', 0], filename_prefix: `fair/wan-${fairHash(prompt).slice(0, 16)}`, ...(modernVideo ? { format: 'mp4', 'format.codec': 'h264' } : { format: 'mp4', codec: 'h264' }) }),
  };
}

async function fairWanBytes(response, limit) {
  if (!response.ok) { const error = new Error(`ComfyUI request failed (HTTP ${response.status}).`); error.status = response.status; throw error; }
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('ComfyUI response exceeds the size limit.'); }
  const chunks = []; let length = 0;
  if (!response.body) throw new Error('ComfyUI returned an empty response.');
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) throw new Error('ComfyUI response exceeds the size limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function fairWanJson(origin, path, { fetchImpl, signal, body } = {}) {
  const response = await fetchImpl(`${origin}${path}`, { signal, redirect: 'error', ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  try { return JSON.parse((await fairWanBytes(response, 16 * 1024 * 1024)).toString('utf8')); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('ComfyUI returned invalid JSON.'); throw error; }
}

async function fairWanInspect({ env, fetchImpl, signal }) {
  const config = fairWanConfig(env);
  const info = await fairWanJson(config.origin, '/object_info', { fetchImpl, signal });
  const videoFormat = info?.SaveVideo?.input?.required?.format?.[0];
  const modernVideo = typeof videoFormat === 'string' && videoFormat.includes('DYNAMIC');
  const graph = fairWanWorkflow({ env, modernVideo });
  for (const { class_type, inputs } of Object.values(graph)) {
    const schema = info?.[class_type]?.input;
    if (!schema?.required) throw new Error(`ComfyUI is missing the built-in ${class_type} node. Update ComfyUI.`);
    const fields = {}, required = [];
    const expand = (part, prefix = '') => {
      for (const [group, definitions] of Object.entries(part)) {
        if (!['required', 'optional'].includes(group)) continue;
        for (const [name, definition] of Object.entries(definitions)) {
          const field = `${prefix}${name}`;
          fields[field] = definition;
          if (group === 'required') required.push(field);
          if (definition[0] === 'COMFY_DYNAMICCOMBO_V3' && field in inputs) {
            const selected = definition[1]?.options?.find(option => option.key === inputs[field]);
            if (!selected) throw new Error(`ComfyUI ${class_type}.${field} does not support the configured choice.`);
            expand(selected.inputs, `${field}.`);
          }
        }
      }
    };
    expand(schema);
    for (const field of required) if (!(field in inputs)) throw new Error(`ComfyUI ${class_type} requires unsupported input ${field}.`);
    for (const [field, value] of Object.entries(inputs)) {
      if (!fields[field]) throw new Error(`ComfyUI ${class_type} does not support ${field}.`);
      const choices = fields[field][0] === 'COMBO' ? fields[field][1]?.options : fields[field][0];
      if (!Array.isArray(value) && Array.isArray(choices) && !choices.includes(value)) throw new Error(`ComfyUI ${class_type}.${field} is missing configured value ${value}. Install the required Wan models.`);
    }
  }
  return { ...config, modernVideo };
}

export async function fairWanReadiness({ env = process.env, fetchImpl = fetch, signal, timeoutMs = 5000 } = {}) {
  try {
    const checked = await fairWanInspect({ env, fetchImpl, signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]) });
    return { available: true, detail: 'ComfyUI exposes the required Wan2.2 nodes and model filenames. GPU execution still requires a successful render.', models: checked.models };
  } catch (error) {
    return { available: false, detail: error.message === 'fetch failed' ? 'ComfyUI is not reachable. Start the local GPU worker or SSH tunnel.' : error.message };
  }
}

function fairWanOutput(history, prompt) {
  const candidates = history?.outputs?.['11']?.images;
  if (!Array.isArray(candidates) || candidates.length !== 1) throw new Error('ComfyUI completed without exactly one MP4 output from SaveVideo.');
  const result = candidates[0];
  if (result.type !== 'output' || typeof result.filename !== 'string' || !/^[A-Za-z0-9_-]+\.mp4$/.test(result.filename) || !result.filename.startsWith(`wan-${fairHash(prompt).slice(0, 16)}_`) || result.subfolder !== 'fair') throw new Error('ComfyUI returned an unsafe or unexpected video output path.');
  return { filename: result.filename, subfolder: result.subfolder, type: 'output' };
}

function fairWanCheckMp4(bytes) {
  if (bytes.length < 24 || bytes.toString('ascii', 4, 8) !== 'ftyp' || !bytes.includes(Buffer.from('moov')) || !bytes.includes(Buffer.from('mdat'))) throw new Error('ComfyUI output is not a complete MP4 container.');
}

export async function fairGenerateWanClip({ prompt, directory, signal, env = process.env, onProgress, fetchImpl = fetch, timeoutMs = 30 * 60_000, pollMs = 2000 } = {}) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 6000) throw new Error('Wan requires a nonempty prompt of at most 6000 characters.');
  if (typeof directory !== 'string' || !directory) throw new Error('Wan requires an output directory.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2 * 60 * 60_000 || !Number.isInteger(pollMs) || pollMs < 1) throw new Error('Invalid Wan timeout or polling interval.');
  signal?.throwIfAborted();
  const config = fairWanConfig(env);
  const fingerprint = fairHash({ version: 1, origin: config.origin, graph: fairWanWorkflow({ prompt, env }) });
  const file = resolve(directory, `fair-wan-${fingerprint}.mp4`);
  const manifestFile = `${file}.json`;
  const requestFile = `${file}.request.json`;
  try {
    const manifest = await fairReadJson(manifestFile);
    if ((await stat(file)).size > fairWanMaxBytes) throw new Error('Cached Wan clip exceeds the size limit.');
    const bytes = await readFile(file);
    if (manifest.fingerprint === fingerprint && manifest.sha256 === fairHash(bytes)) {
      fairWanCheckMp4(bytes);
      signal?.throwIfAborted();
      return { file, sha256: manifest.sha256, provenance: manifest.provenance, cached: true };
    }
  } catch (error) { if (error.name === 'AbortError') throw error; }
  if (fairWanJobs.has(file)) throw new Error('This Wan clip is already generating. Wait before retrying.');
  fairWanJobs.set(file, true);
  const deadline = AbortSignal.timeout(timeoutMs);
  const requestSignal = AbortSignal.any([deadline, ...(signal ? [signal] : [])]);
  let promptId; const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const inspected = await fairWanInspect({ env, fetchImpl, signal: requestSignal });
    const graph = fairWanWorkflow({ prompt, env, modernVideo: inspected.modernVideo });
    await mkdir(directory, { recursive: true });
    await onProgress?.('Generating the illustrative scene with Wan2.2 on ComfyUI.');
    let previous;
    try { previous = await fairReadJson(requestFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous) {
      if (previous.fingerprint !== fingerprint || !/^[A-Za-z0-9_-]{1,128}$/.test(previous.promptId) || !/^[a-f0-9]{64}$/.test(previous.workflowSha256)) throw new Error('Invalid saved Wan request record.');
      promptId = previous.promptId;
      const history = await fairWanJson(config.origin, `/history/${encodeURIComponent(promptId)}`, { fetchImpl, signal: requestSignal });
      if (!history[promptId]) {
        const queue = await fairWanJson(config.origin, '/queue', { fetchImpl, signal: requestSignal });
        if (![...(queue.queue_running || []), ...(queue.queue_pending || [])].some(item => item[1] === promptId)) throw new Error('The previous Wan submission cannot be located. Check worker history before removing the clip request.json record and retrying; generation was not resubmitted.');
      }
      await onProgress?.('Resuming the existing Wan request without generating a duplicate.');
    } else {
      promptId = randomUUID();
      // Persist before POST: an ambiguous connection failure must never silently spend GPU time twice.
      await fairWriteJson(requestFile, { fingerprint, promptId, workflowSha256: fairHash(graph) });
      let queued;
      try {
        queued = await fairWanJson(config.origin, '/prompt', { fetchImpl, signal: requestSignal, body: { prompt: graph, prompt_id: promptId, client_id: `fair-${randomUUID()}` } });
      } catch (error) {
        if ([400, 401, 403, 404, 422].includes(error.status)) await rm(requestFile, { force: true });
        throw error;
      }
      if (queued.error || Object.keys(queued.node_errors || {}).length || typeof queued.prompt_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(queued.prompt_id)) {
        if (queued.error) await rm(requestFile, { force: true });
        throw new Error('ComfyUI rejected the Wan workflow. Check the worker logs and installed model compatibility.');
      }
      promptId = queued.prompt_id;
      await fairWriteJson(requestFile, { fingerprint, promptId, workflowSha256: fairHash(graph) });
    }
    let completed;
    while (!completed) {
      requestSignal.throwIfAborted();
      const record = (await fairWanJson(config.origin, `/history/${encodeURIComponent(promptId)}`, { fetchImpl, signal: requestSignal }))[promptId];
      if (record?.status?.status_str === 'error' || record?.status?.messages?.some(message => ['execution_error', 'execution_interrupted'].includes(message[0]))) {
        await rm(requestFile, { force: true });
        throw new Error('Wan generation failed or was interrupted on ComfyUI. Check the GPU worker logs.');
      }
      if (record?.status?.completed === true) completed = record;
      else await fairDelay(pollMs, undefined, { signal: requestSignal });
    }
    const output = fairWanOutput(completed, prompt);
    const response = await fetchImpl(`${config.origin}/view?${new URLSearchParams(output)}`, { signal: requestSignal, redirect: 'error' });
    const bytes = await fairWanBytes(response, fairWanMaxBytes);
    fairWanCheckMp4(bytes);
    requestSignal.throwIfAborted();
    const sha256 = fairHash(bytes);
    const provenance = { provider: 'comfyui', model: 'Wan2.2-TI2V-5B', modelFiles: config.models, modelLicense: 'Apache-2.0', workerLicense: 'GPL-3.0', promptId, promptSha256: fairHash(prompt), workflowSha256: previous?.workflowSha256 || fairHash(graph), generatedAt: new Date().toISOString(), frames: config.frames, fps: config.fps, width: config.width, height: config.height, steps: config.steps, textDevice: config.textDevice };
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, file);
    await fairWriteJson(manifestFile, { fingerprint, sha256, provenance });
    return { file, sha256, provenance, cached: false };
  } catch (error) {
    if (promptId && requestSignal.aborted) {
      // Dequeue only our own pending job. Never use the worker-wide /interrupt endpoint.
      const cleanupSignal = AbortSignal.timeout(3000);
      try {
        const before = await fairWanJson(config.origin, '/queue', { fetchImpl, signal: cleanupSignal });
        const pending = before.queue_pending?.some(item => item[1] === promptId);
        const removed = await fetchImpl(`${config.origin}/queue`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delete: [promptId] }), redirect: 'error', signal: cleanupSignal });
        if (pending && removed.ok) {
          const after = await fairWanJson(config.origin, '/queue', { fetchImpl, signal: cleanupSignal });
          const history = await fairWanJson(config.origin, `/history/${encodeURIComponent(promptId)}`, { fetchImpl, signal: cleanupSignal });
          if (!history[promptId] && ![...(after.queue_running || []), ...(after.queue_pending || [])].some(item => item[1] === promptId)) await rm(requestFile, { force: true });
        }
      } catch {}
    }
    if (signal?.aborted) throw new Error('Generation cancelled. A Wan job already running may finish on the worker.');
    if (deadline.aborted) throw new Error('Wan generation exceeded its time limit. A job already running may finish on the worker.');
    throw error;
  } finally {
    fairWanJobs.delete(file);
    await rm(temporary, { force: true });
  }
}
