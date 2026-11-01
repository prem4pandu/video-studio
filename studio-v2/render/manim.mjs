import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { fairCommand, fairWriteJson } from '../../src/utils.mjs';
import { captionChunks } from './compose.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scenesPy = join(repo, 'studio-v2/render/manim_scenes.py');
const escape = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const timestamp = t => { const ms = Math.round(t * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };

const palettes = {
  editorial: { background: '#fafcfb', ink: '#153c3a', muted: '#43615e', accent: '#0a766b', second: '#ac4e20', soft: '#dcece6', accentInk: '#ffffff' },
  playful: { background: '#fff8e9', ink: '#233c36', muted: '#53645b', accent: '#147763', second: '#a84624', soft: '#f1dfae', accentInk: '#ffffff' },
  bold: { background: '#f4efea', ink: '#282c42', muted: '#50546c', accent: '#433a8b', second: '#b44035', soft: '#ded9f2', accentInk: '#ffffff' },
};

export function manimPaths(env = process.env) {
  return { python: env.STUDIO_V2_MANIM_PYTHON || join(repo, '.fair-neural/manim-venv/bin/python'), ffmpeg: env.FAIR_FFMPEG || 'ffmpeg' };
}
export async function manimReadiness(env = process.env) {
  const { python } = manimPaths(env);
  try {
    if (!statSync(python).isFile()) throw 0;
    await fairCommand(python, ['-c', 'import manim; print(manim.__version__)'], { env, timeoutMs: 20000 });
    return { available: true, detail: `ManimCE scene renderer at ${python}`, engine: 'manim' };
  } catch {
    return { available: false, detail: 'ManimCE is not installed; run the manim environment setup.', engine: 'manim' };
  }
}

function makeBed(duration, mode) {
  const rate = 16000, length = Math.ceil(duration * rate), buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + length * 2, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40);
  const notes = [130.8128, 164.8138, 195.9977, 261.6256];
  for (let i = 0; i < length; i++) { const t = i / rate, beat = mode === 'social' ? .6 : 1, phase = t % beat, note = notes[Math.floor(t / beat) % 4]; const fade = Math.min(1, t / 2, (duration - t) / 2); const pad = notes.slice(0, 3).reduce((s, f) => s + Math.sin(2 * Math.PI * f * t), 0) / 3; const bell = Math.sin(2 * Math.PI * note * 2 * t) * Math.exp(-phase * 8); buffer.writeInt16LE(Math.round((pad * .008 + bell * .012) * Math.max(0, fade) * 32767), 44 + i * 2); }
  return buffer;
}

function labelReveals(scene, track) {
  const labels = (scene.labels || []).filter(Boolean).slice(0, 4);
  const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const words = (track.words || []).map(w => norm(w.text));
  return labels.map((label, i) => {
    const tokens = norm(label).split(' ');
    if (tokens[0]) for (let k = 0; k < words.length; k++) if (tokens.every((w, j) => words[k + j] === w)) return { label, at: .35 + track.words[k].startSeconds };
    return { label, at: .35 + (i + .3) / (labels.length + .5) * Math.max(1, track.durationSeconds - 1) };
  });
}

export async function renderWithManim(plan, tracks, workspace, { format = 'landscape', style = 'auto', env = process.env, signal, onProgress } = {}) {
  workspace = resolve(workspace);
  const portrait = format === 'portrait', width = portrait ? 1080 : 1920, height = portrait ? 1920 : 1080;
  const chosen = style === 'auto' ? (plan.mode === 'learning' ? 'editorial' : plan.mode === 'story' ? 'playful' : 'bold') : style;
  const p = palettes[chosen] || palettes.editorial;
  const { python, ffmpeg } = manimPaths(env);
  const media = join(workspace, 'media'), segs = join(workspace, 'segments');
  await mkdir(segs, { recursive: true });
  let durationSeconds = 0;
  const scenes = [], captions = [], specScenes = [], voices = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i], track = tracks.find(t => t.sceneId === scene.id);
    if (!track?.file || !Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0) throw new Error(`Missing measured audio for scene ${scene.id}`);
    const pause = clamp(Number(scene.pauseSeconds) || 0, 0, 5), duration = Math.ceil((.35 + track.durationSeconds + pause + .4) * 30) / 30, start = durationSeconds;
    durationSeconds += duration;
    specScenes.push({ ...scene, duration, reveals: labelReveals(scene, track) });
    const ext = track.file.slice(track.file.lastIndexOf('.')) || '.wav', audioPath = join(segs, `voice-${i}${ext}`);
    await copyFile(resolve(track.file), audioPath);
    voices.push({ file: audioPath, start: start + .35, duration: track.durationSeconds });
    scenes.push({ id: scene.id, compositionId: `scene-${i}-${scene.id}`, start, duration, kind: scene.kind, speechStart: start + .35, speechDuration: track.durationSeconds, pauseSeconds: pause });
    captions.push(...captionChunks(scene, track, portrait ? 35 : 64).map(c => ({ ...c, start: c.start + start, end: c.end + start, sceneId: scene.id })));
  }
  const specFile = join(workspace, 'manim-spec.json');
  await mkdir(workspace, { recursive: true });
  await fairWriteJson(specFile, { width, height, portrait, palette: p, scenes: specScenes });
  const quality = env.STUDIO_V2_MANIM_QUALITY || 'qm';
  for (let i = 0; i < specScenes.length; i++) {
    signal?.throwIfAborted();
    await onProgress?.({ stage: 'render', progress: 72 + Math.round(i / specScenes.length * 14), message: `Animating scene ${i + 1} of ${specScenes.length} with ManimCE.` });
    await fairCommand(python, ['-m', 'manim', `-${quality}`, '--media_dir', media, scenesPy, `Scene_${i}`], { env: { ...env, V2_MANIM_SPEC: specFile }, signal, timeoutMs: 600000 });
    const segFile = join(media, `videos/manim_scenes/${quality === 'qm' ? '720p30' : '480p15'}/Scene_${i}.mp4`);
    await copyFile(segFile, join(segs, `seg-${i}.mp4`));
  }
  await onProgress?.({ stage: 'render', progress: 88, message: 'Joining animated scenes with the narration and music bed.' });
  await writeFile(join(segs, 'concat.txt'), voices.map((v, i) => `file 'seg-${i}.mp4'`).join('\n'));
  await fairCommand(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(segs, 'concat.txt'), '-vf', `scale=${width}:${height}:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', join(segs, 'video.mp4')], { env, signal, timeoutMs: 300000 });
  const bedPath = join(segs, 'bed.wav');
  await writeFile(bedPath, makeBed(durationSeconds, plan.mode));
  const inputs = ['-i', join(segs, 'video.mp4'), ...voices.flatMap(v => ['-i', v.file]), '-i', bedPath];
  const filters = voices.map((v, i) => `[${i + 1}:a]adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`).join(';') + `;${voices.map((v, i) => `[v${i}]`).join('')}[${voices.length + 1}:a]amix=inputs=${voices.length + 1}:normalize=0[aout]`;
  await fairCommand(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filters, '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', join(workspace, 'render.mp4')], { env, signal, timeoutMs: 300000 });
  const vtt = 'WEBVTT\n\n' + captions.map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}\n`).join('\n');
  await writeFile(join(workspace, 'captions.vtt'), vtt);
  await fairWriteJson(join(workspace, 'storyboard.json'), { width, height, durationSeconds, scenes, captions, cues: [] });
  return { durationSeconds, width, height, scenes, captions, cues: [], renderFile: join(workspace, 'render.mp4'), artifacts: { captions: join(workspace, 'captions.vtt') } };
}
