#!/usr/bin/env node
// Environment readiness report for the zero-cost local pipeline.
// Reports blockers honestly; a missing optional provider is a warning, never a fail.
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand } from '../src/utils.mjs';
import { fairQwenPaths } from '../src/qwen-voice.mjs';
import { fairNeuralPaths, fairPiperPaths } from '../src/neural-voice.mjs';
import { fairLoadCurricula, fairCurriculumIndex } from '../src/curriculum.mjs';
import { FAIR_OPEN_MODEL } from '../src/open-config.mjs';

const env = process.env;
const appDir = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const report = (name, ok, detail, blocker = false) => { results.push({ name, ok, blocker }); console.log(`${ok ? ' ok ' : blocker ? 'FAIL' : 'warn'} ${name.padEnd(34)} ${detail}`); };
const file = async path => { try { return (await stat(path)).isFile(); } catch { return false; } };
const dir = async path => { try { return (await stat(path)).isDirectory(); } catch { return false; } };

const ollama = env.FAIR_OLLAMA_URL || 'http://127.0.0.1:11434';
const planner = env.FAIR_MODEL || 'gpt-oss:20b';
const critic = env.FAIR_REVIEW_MODEL || planner;
let models = [];
try {
  const response = await fetch(new URL('api/tags', `${ollama.replace(/\/$/, '')}/`), { signal: AbortSignal.timeout(3000) });
  models = ((await response.json()).models || []).map(m => m.name);
  report('Ollama service', true, `${ollama} · ${models.length} models`);
} catch { report('Ollama service', false, `not reachable at ${ollama} — run: ollama serve`, true); }
report('planner model', models.includes(planner), models.includes(planner) ? planner : `missing — run: ollama pull ${planner}`, true);
if (critic !== planner) report('critic model', models.includes(critic), models.includes(critic) ? `${critic} (independent review)` : `missing — run: ollama pull ${critic} (or accept same-model review)`);
else report('critic model', models.length > 0, `${critic} (same model reviews its own draft — a different critic is stronger)`);

for (const bin of ['ffmpeg', 'ffprobe']) {
  try { await fairCommand(env[`FAIR_${bin.toUpperCase()}`] || bin, ['-version'], { timeoutMs: 5000, env }); report(bin, true, 'found'); }
  catch { report(bin, false, 'missing — run: brew install ffmpeg', true); }
}

const qwen = fairQwenPaths(env);
if (await file(qwen.python) && await file(join(qwen.modelDir, 'config.json'))) {
  try { await fairCommand(qwen.python, ['-c', 'import mlx_audio, soundfile, mlx.core'], { timeoutMs: 8000, env }); report('Qwen3-TTS teacher voice', true, `${qwen.modelDir}`); }
  catch { report('Qwen3-TTS teacher voice', false, 'venv exists but mlx_audio import fails', true); }
} else report('Qwen3-TTS teacher voice', false, 'missing — run: .fair-neural/qwen-venv/bin/python scripts/qwen-audition.py (downloads ~3 GB)', env.FAIR_TTS_PROVIDER === 'qwentts' || !env.FAIR_TTS_PROVIDER);

const piper = fairPiperPaths(env);
report('Piper draft voice', await file(piper.python) && await file(piper.model), await file(piper.model) ? piper.model : 'optional fallback — install if wanted');
const kokoro = fairNeuralPaths(env);
report('Kokoro alternate voice', await file(kokoro.python) && await file(kokoro.model), await file(kokoro.model) ? kokoro.model : 'optional');

if (await dir(join(appDir, '.fair-open'))) {
  const manim = env.FAIR_MANIM_PYTHON || join(appDir, '.fair-open/venv/bin/python');
  report('Manim (open-source version)', await file(manim), await file(manim) ? manim : 'optional — needed only for generationVersion=open-source');
  try {
    const response = await fetch(env.FAIR_COMFYUI_URL || 'http://127.0.0.1:8188', { signal: AbortSignal.timeout(2000) });
    report('ComfyUI (Wan2.2 footage)', response.ok, response.ok ? 'running — euler sampler enforced for Apple Silicon' : 'optional — needed only for Wan footage');
  } catch { report('ComfyUI (Wan2.2 footage)', false, 'optional — not running'); }
  report('open-source planner', models.includes(env.FAIR_OPEN_MODEL || FAIR_OPEN_MODEL), env.FAIR_OPEN_MODEL || FAIR_OPEN_MODEL);
}

try {
  const trees = await fairLoadCurricula(env);
  const topics = fairCurriculumIndex(trees).length;
  const objectives = trees.reduce((sum, tree) => sum + tree.units.reduce((s, u) => s + u.topics.reduce((t, topic) => t + topic.objectives.length, 0), 0), 0);
  report('curriculum trees', true, `${trees.length} tree(s) · ${topics} topics · ${objectives} objectives`, true);
} catch (error) { report('curriculum trees', false, error.message, true); }

const blocked = results.filter(item => !item.ok && item.blocker);
console.log(blocked.length ? `\n${blocked.length} blocker(s): fix the FAIL rows before generating.` : '\nReady to generate. Drafts still need educator review.');
process.exit(blocked.length ? 1 : 0);
