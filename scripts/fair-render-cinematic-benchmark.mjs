import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairGenerateWanClip } from '../src/fair-wan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(root, 'proofs/cinematic-benchmark');
const spec = JSON.parse(await readFile(join(project, 'generation.json'), 'utf8'));
const mode = process.argv.includes('--preview') ? 'preview' : process.argv.includes('--local') ? 'local' : 'delivery';
const settings = spec[mode];
const env = {
  ...process.env,
  FAIR_WAN_WIDTH: String(settings.width),
  FAIR_WAN_HEIGHT: String(settings.height),
  FAIR_WAN_FRAMES: String(settings.frames),
  FAIR_WAN_FPS: String(settings.fps),
  FAIR_WAN_STEPS: String(settings.steps),
  FAIR_WAN_TEXT_DEVICE: 'cpu'
};

const result = await fairGenerateWanClip({
  prompt: spec.prompt,
  referenceImage: join(project, spec.referenceImage),
  directory: join(project, 'candidates/wan'),
  env,
  timeoutMs: 2 * 60 * 60_000,
  onProgress: message => console.log(message)
});

console.log(JSON.stringify({ mode, ...result }, null, 2));
