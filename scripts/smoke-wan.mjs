import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fairGenerateWanClip } from '../src/wan.mjs';
import { fairProbe } from '../src/voice.mjs';
import { fairFileHash, fairWriteJson } from '../src/utils.mjs';

// A small real inference test, not a claim of production resolution or quality.
const env = { ...process.env, FAIR_WAN_WIDTH: process.env.FAIR_WAN_WIDTH || '512',
  FAIR_WAN_HEIGHT: process.env.FAIR_WAN_HEIGHT || '288', FAIR_WAN_FRAMES: process.env.FAIR_WAN_FRAMES || '17',
  FAIR_WAN_STEPS: process.env.FAIR_WAN_STEPS || '20', FAIR_WAN_FPS: process.env.FAIR_WAN_FPS || '24' };
await mkdir('.fair-video', { recursive: true });
const directory = await mkdtemp(resolve('.fair-video/wan-smoke-'));
const started = performance.now();
const clip = await fairGenerateWanClip({ directory, env,
  prompt: 'A quiet welcoming illustrated learning room, soft daylight, a wooden desk beside a window, a plant gently moving in the breeze, locked stationary camera, clean friendly two-dimensional animation style. No text, no numerals, no equations, no people, no logos.',
  onProgress: message => console.log(`[${((performance.now() - started) / 1000).toFixed(1)}s] ${message}`),
});
const media = await fairProbe(clip.file, { env });
assert.ok(media.streams.some(stream => stream.codec_type === 'video'));
assert.ok(Number(media.format.duration) >= .5);
assert.equal(await fairFileHash(clip.file), clip.sha256);
const report = { technicalPassed: true, visualReview: { status: 'pending' }, elapsedSeconds: (performance.now() - started) / 1000,
  cached: clip.cached || false, clip, media, limitations: ['Small hardware verification clip; visual quality requires inspection.'] };
await fairWriteJson(join(directory, 'smoke-report.json'), report);
console.log(JSON.stringify(report, null, 2));
