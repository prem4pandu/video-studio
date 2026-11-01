import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fairHash } from './utils.mjs';
import { fairWanWorkflow } from './wan.mjs';

const node = (class_type, inputs) => ({ class_type, inputs });
const modelFiles = {
  h3: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors', 'minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae_fp32.safetensors', 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'],
  ltx: ['ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', 'ltx-2.5-video-vae-conv-bf16.safetensors', 'ltx-2.5-audio-vae-bf16.safetensors'],
  wan: ['wan2.2_ti2v_5B_fp16.safetensors', 'umt5_xxl_fp16.safetensors', 'wan2.2_vae.safetensors'],
};

export const fairVideoComparisonDefaults = Object.freeze({ width: 256, height: 256, fps: 24, seed: 424242 });

export function fairH3Workflow(prompt, options = {}) {
  const { width, height, fps, seed } = { ...fairVideoComparisonDefaults, ...options };
  const length = options.frames || 22;
  return {
    '1': node('VAELoader', { vae_name: modelFiles.h3[2] }),
    '2': node('VAELoader', { vae_name: modelFiles.h3[3] }),
    '3': node('UNETLoader', { unet_name: modelFiles.h3[0], weight_dtype: 'default' }),
    '4': node('LoraLoaderModelOnly', { lora_name: modelFiles.h3[4], strength_model: 1, model: ['3', 0] }),
    '5': node('CLIPLoader', { clip_name: modelFiles.h3[1], type: 'minimax', device: 'default' }),
    '6': node('MiniMaxH3ImageToVideo', { prompt, width, height, length, clip: ['5', 0], vae: ['1', 0] }),
    '7': node('RandomNoise', { noise_seed: seed }),
    '8': node('BasicGuider', { model: ['4', 0], conditioning: ['6', 0] }),
    '9': node('KSamplerSelect', { sampler_name: 'res_multistep' }),
    '10': node('BasicScheduler', { scheduler: 'simple', steps: 8, denoise: 1, model: ['4', 0] }),
    '11': node('SamplerCustomAdvanced', { noise: ['7', 0], guider: ['8', 0], sampler: ['9', 0], sigmas: ['10', 0], latent_image: ['6', 1] }),
    '12': node('VAEDecode', { samples: ['11', 0], vae: ['1', 0] }),
    '13': node('VAEDecodeAudio', { samples: ['11', 0], vae: ['2', 0] }),
    '14': node('CreateVideo', { fps, bit_depth: 8, color_space: 'sRGB', codec: 'none', images: ['12', 0], audio: ['13', 0] }),
    '15': node('SaveVideo', { filename_prefix: `fair/h3-${fairHash(prompt).slice(0, 16)}`, format: 'auto', 'format.codec': 'auto', codec: 'auto', video: ['14', 0] }),
  };
}

export function fairLtxWorkflow(prompt, options = {}) {
  const { width, height, fps, seed } = { ...fairVideoComparisonDefaults, ...options };
  const length = options.frames || 17;
  return {
    '1': node('UNETLoader', { unet_name: modelFiles.ltx[0], weight_dtype: 'default' }),
    '2': node('CLIPLoader', { clip_name: modelFiles.ltx[1], type: 'ltxv', device: 'default' }),
    '3': node('VAELoader', { vae_name: modelFiles.ltx[2] }),
    '4': node('VAELoader', { vae_name: modelFiles.ltx[3] }),
    '5': node('CLIPTextEncode', { text: prompt, clip: ['2', 0] }),
    '6': node('CLIPTextEncode', { text: 'text, letters, numerals, captions, watermark, blurry, flashing lights, extra objects', clip: ['2', 0] }),
    '7': node('LTXVConditioning', { positive: ['5', 0], negative: ['6', 0], frame_rate: fps }),
    '8': node('EmptyLTXVLatentVideo', { width, height, length, batch_size: 1 }),
    '9': node('LTXVEmptyLatentAudio', { frames_number: length, frame_rate: fps, batch_size: 1, audio_vae: ['4', 0] }),
    '10': node('LTXVConcatAVLatent', { video_latent: ['8', 0], audio_latent: ['9', 0] }),
    '11': node('RandomNoise', { noise_seed: seed }),
    '12': node('LTXVDualCFGGuider', { model: ['1', 0], positive: ['7', 0], negative: ['7', 1], video_cfg: 1, audio_cfg: 1 }),
    '13': node('KSamplerSelect', { sampler_name: 'euler_ancestral' }),
    '14': node('ManualSigmas', { sigmas: '0.85, 0.725, 0.4219, 0.0' }),
    '15': node('SamplerCustomAdvanced', { noise: ['11', 0], guider: ['12', 0], sampler: ['13', 0], sigmas: ['14', 0], latent_image: ['10', 0] }),
    '16': node('LTXVSeparateAVLatent', { av_latent: ['15', 0] }),
    '17': node('VAEDecodeTiled', { samples: ['16', 0], vae: ['3', 0], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 16 }),
    '18': node('LTXVAudioVAEDecode', { samples: ['16', 1], audio_vae: ['4', 0] }),
    '19': node('CreateVideo', { fps, bit_depth: 8, color_space: 'sRGB', codec: 'none', images: ['17', 0], audio: ['18', 0] }),
    '20': node('SaveVideo', { filename_prefix: `fair/ltx-${fairHash(prompt).slice(0, 16)}`, format: 'auto', 'format.codec': 'auto', codec: 'auto', video: ['19', 0] }),
  };
}

export function fairComparisonWorkflow(model, prompt, options = {}) {
  if (model === 'h3') return { graph: fairH3Workflow(prompt, options), outputNode: '15', files: modelFiles.h3 };
  if (model === 'ltx') return { graph: fairLtxWorkflow(prompt, options), outputNode: '20', files: modelFiles.ltx };
  if (model === 'wan') {
    const env = { ...process.env, FAIR_WAN_WIDTH: String(options.width || 256), FAIR_WAN_HEIGHT: String(options.height || 256), FAIR_WAN_FRAMES: String(options.frames || 17), FAIR_WAN_STEPS: String(options.steps || 8), FAIR_WAN_FPS: String(options.fps || 24) };
    const graph = fairWanWorkflow({ prompt, env, modernVideo: true });
    graph['8'].inputs.seed = options.seed ?? fairVideoComparisonDefaults.seed;
    return { graph, outputNode: '11', files: modelFiles.wan };
  }
  throw new Error(`Unknown local video model: ${model}`);
}

async function json(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, { redirect: 'error', ...options, headers: options.body ? { 'content-type': 'application/json' } : undefined });
  if (!response.ok) throw new Error(`ComfyUI ${path} failed with HTTP ${response.status}.`);
  return response.json();
}

export async function fairGenerateComparisonClip({ model, prompt, directory, options = {}, origin = 'http://127.0.0.1:8188', onProgress = () => {} }) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/') throw new Error('The comparison runner only accepts a loopback ComfyUI origin.');
  const { graph, outputNode, files } = fairComparisonWorkflow(model, prompt, options);
  const info = await json(url.origin, '/object_info');
  const missingNodes = [...new Set(Object.values(graph).map(item => item.class_type).filter(type => !info[type]))];
  if (missingNodes.length) throw new Error(`ComfyUI is missing nodes: ${missingNodes.join(', ')}.`);
  for (const file of files) if (!JSON.stringify(info).includes(file)) throw new Error(`${model} model file is not registered: ${file}.`);
  const promptId = randomUUID();
  const started = performance.now();
  onProgress(`${model}: queued`);
  const queued = await json(url.origin, '/prompt', { method: 'POST', body: JSON.stringify({ prompt: graph, prompt_id: promptId, client_id: `comparison-${randomUUID()}` }) });
  if (queued.error || Object.keys(queued.node_errors || {}).length) throw new Error(`${model} workflow was rejected: ${JSON.stringify(queued.node_errors || queued.error)}`);
  let record;
  while (!record?.status?.completed) {
    await delay(2000);
    record = (await json(url.origin, `/history/${encodeURIComponent(promptId)}`))[promptId];
    if (record?.status?.status_str === 'error' || record?.status?.messages?.some(message => message[0] === 'execution_error')) throw new Error(`${model} render failed; inspect the ComfyUI log.`);
  }
  const item = record.outputs?.[outputNode]?.images?.[0];
  if (!item || item.type !== 'output' || !item.filename?.endsWith('.mp4')) throw new Error(`${model} completed without an MP4 output.`);
  const response = await fetch(`${url.origin}/view?${new URLSearchParams({ filename: item.filename, subfolder: item.subfolder || '', type: 'output' })}`, { redirect: 'error' });
  if (!response.ok) throw new Error(`${model} output download failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error(`${model} returned an invalid MP4.`);
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${model}.mp4`);
  await writeFile(file, bytes, { mode: 0o600 });
  return { model, file, bytes: bytes.length, sha256: fairHash(bytes), elapsedSeconds: (performance.now() - started) / 1000, modelFiles: files };
}
