#!/usr/bin/env node
// Read-only audit of a rendered lesson project.
//
// Teaching videos fail quietly: the narration is correct, the checks pass, and
// the picture still sits frozen for two thirds of the runtime while the voice
// explains. This tool reads the composition the pipeline actually emitted and
// reports how much of the runtime is a still picture, how often the screen
// changes, and how many spoken words each change has to carry.
//
// Usage:
//   node tools/fair-teaching-metrics.mjs <projectDir> [<projectDir> ...] [--json]
//
// It never writes to the project. It reads index.html, storyboard.json,
// narration.json and (for film-path lessons) scenes/<id>.html.

import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const MOUTH = /-mouth|avatar-eyes/;
const PAUSE = /-bar'|think-fill|-pause'|-pose-\d/;

function timelineStatements(code) {
  const out = [];
  for (const chunk of code.split(';')) {
    if (!/\btl\.\w+\(/.test(chunk)) continue;
    const time = chunk.match(/,(-?\d+(?:\.\d+)?)\)\s*$/);
    if (!time) continue;
    const selector = chunk.match(/\(\s*'([^']*)'/)?.[1] ?? chunk.match(/\(\s*"([^"]*)"/)?.[1] ?? '';
    const duration = Number(chunk.match(/duration:\s*([\d.]+)/)?.[1] ?? 0);
    out.push({ selector, at: Number(time[1]), duration: Number.isFinite(duration) ? duration : 0 });
  }
  return out;
}

async function readScripts(directory) {
  const html = await readFile(join(directory, 'index.html'), 'utf8').catch(() => '');
  const perScene = new Map();
  const sceneFiles = await readdir(join(directory, 'scenes')).catch(() => []);
  for (const file of sceneFiles.filter(name => name.endsWith('.html'))) {
    const text = await readFile(join(directory, 'scenes', file), 'utf8');
    const scenes = text.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? text;
    perScene.set(file.replace(/\.html$/, ''), timelineStatements(scenes));
  }
  return { html, perScene };
}

export async function teachingMetrics(directory) {
  const projectDir = resolve(directory);
  const storyboard = JSON.parse(await readFile(join(projectDir, 'storyboard.json'), 'utf8'));
  const narration = await readFile(join(projectDir, 'narration.json'), 'utf8').then(JSON.parse).catch(() => []);
  const speech = Object.fromEntries(narration.map(item => [item.sceneId, item.durationSeconds]));
  const { html, perScene } = await readScripts(projectDir);
  const allStatements = timelineStatements(html);

  const pauses = (storyboard.audioCues?.pauses ?? []).map(pause => ({ start: pause.start, end: pause.end }));
  const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
  const scenes = storyboard.scenes.map(scene => {
    const local = perScene.get(scene.id);
    const statements = (local ?? allStatements.filter(item => item.at >= scene.start - 1e-6 && item.at < scene.start + scene.duration - 1e-6))
      .map(item => ({ ...item, at: (local ? scene.start : 0) + item.at }));
    // Ambient motion is not a teaching change: the per-scene push (one tween on
    // the scene root that spans the whole scene) and the guide's breathing loop
    // keep pixels alive without changing what the picture says.
    const isContent = item => !MOUTH.test(item.selector) && !PAUSE.test(item.selector)
      && item.selector !== `#fair-${scene.id}` && !item.selector.includes('.presenter svg')
      && item.duration < scene.duration * 0.9;
    const intervals = statements.filter(isContent)
      .map(item => ({ start: Math.max(0, item.at - scene.start), stop: Math.min(scene.duration, item.at - scene.start + item.duration) }))
      .sort((left, right) => left.start - right.start);
    const merged = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval.start <= last.stop) last.stop = Math.max(last.stop, interval.stop);
      else merged.push({ ...interval });
    }
    const end = scene.duration;
    // Declared thinking pauses are intentional holds: the question is meant to
    // sit while the child answers. Frozen time inside a pause window does not
    // count against the pacing budget.
    const pausesInScene = pauses
      .map(pause => ({ start: pause.start - scene.start, end: pause.end - scene.start }))
      .filter(pause => pause.end > 0 && pause.start < end);
    const pauseCover = (a, b) => pausesInScene.reduce((sum, pause) => sum + overlap(a, b, pause.start, pause.end), 0);
    let maxGap = Math.max(0, (merged.length ? merged[0].start : end) - pauseCover(0, merged.length ? merged[0].start : end));
    let maxGapAt = 0;
    for (let index = 1; index < merged.length; index++) {
      const raw = merged[index].start - merged[index - 1].stop;
      const gap = Math.max(0, raw - pauseCover(merged[index - 1].stop, merged[index].start));
      if (gap > maxGap) { maxGap = gap; maxGapAt = merged[index - 1].stop; }
    }
    const rawTail = merged.length ? end - merged.at(-1).stop : end;
    const tail = Math.max(0, rawTail - pauseCover(merged.length ? merged.at(-1).stop : 0, end));
    if (merged.length && tail > maxGap) { maxGap = tail; maxGapAt = merged.at(-1).stop; }
    const content = merged.map(interval => interval.start);
    const words = (scene.narration ?? '').trim().split(/\s+/).filter(Boolean).length;
    return {
      id: scene.id, beat: scene.beat, visual: scene.visual?.kind ?? 'none',
      durationSeconds: +end.toFixed(2), speechSeconds: speech[scene.id] ? +speech[scene.id].toFixed(2) : null,
      words, contentChanges: content.length,
      firstChangeSeconds: content.length ? +content[0].toFixed(2) : null,
      lastChangeSeconds: merged.length ? +merged.at(-1).stop.toFixed(2) : null,
      staticTailSeconds: +tail.toFixed(2),
      staticTailPercent: Math.round(tail / Math.max(0.01, end - pausesInScene.reduce((sum, pause) => sum + Math.min(end, pause.end) - Math.max(0, pause.start), 0)) * 100),
      maxStaticIntervalSeconds: +maxGap.toFixed(2), maxStaticIntervalAtSeconds: +maxGapAt.toFixed(2),
      wordsPerChange: content.length ? +(words / content.length).toFixed(1) : null,
      oneShot: content.length <= 1,
    };
  });

  const duration = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const staticTail = scenes.reduce((sum, scene) => sum + scene.staticTailSeconds, 0);
  const changes = scenes.reduce((sum, scene) => sum + scene.contentChanges, 0);
  const words = scenes.reduce((sum, scene) => sum + scene.words, 0);
  const worst = scenes.reduce((worst, scene) => scene.maxStaticIntervalSeconds > worst.maxStaticIntervalSeconds ? scene : worst, scenes[0]);
  const summary = {
    projectDir, durationSeconds: +duration.toFixed(1),
    scenes: scenes.length, contentChanges: changes,
    changesPerMinute: +(changes / (duration / 60)).toFixed(1),
    staticTailSeconds: +staticTail.toFixed(1),
    staticTailPercent: Math.round(staticTail / duration * 100),
    words, wordsPerChange: changes ? +(words / changes).toFixed(1) : null,
    oneShotScenes: scenes.filter(scene => scene.oneShot).map(scene => scene.id),
    worstStaticInterval: { scene: worst.id, seconds: worst.maxStaticIntervalSeconds, atSeconds: worst.maxStaticIntervalAtSeconds },
    medianSceneSeconds: +scenes.map(scene => scene.durationSeconds).sort((a, b) => a - b)[Math.floor(scenes.length / 2)].toFixed(1),
  };
  return { summary, scenes };
}

// Provisional gates for a 9-10 year old teaching video. They are deliberately
// blunt: they catch "the screen is frozen while the voice explains", which is
// the failure mode that reads as cheap even when the maths is right.
// Motion energy measured from the encoded video, not from the DOM: how much of
// the frame actually changes between frames. A lesson can pass the DOM audit and
// still be a slideshow, so this is the honest "is it animated" number.
const run = promisify(execFile);

export async function motionMetrics(videoFile, { env = process.env } = {}) {
  const { stdout } = await run(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', videoFile,
    '-vf', 'tblend=all_mode=difference,signalstats,metadata=print:file=-', '-f', 'null', '-'], { maxBuffer: 512 * 1024 * 1024 });
  const samples = [];
  let time = null;
  for (const line of stdout.split('\n')) {
    const at = line.match(/pts_time:([\d.]+)/);
    if (at) { time = Number(at[1]); continue; }
    const average = line.match(/YAVG=([\d.]+)/);
    if (average && time !== null) samples.push({ t: time, value: Number(average[1]) });
  }
  if (!samples.length) throw new Error(`No frame statistics from ${videoFile}`);
  const sorted = samples.map(sample => sample.value).sort((left, right) => left - right);
  const total = samples.reduce((sum, sample) => sum + sample.value, 0);
  const bySecond = new Map();
  for (const sample of samples) {
    const second = Math.floor(sample.t);
    if (!bySecond.has(second)) bySecond.set(second, []);
    bySecond.get(second).push(sample.value);
  }
  // Per-second peak, not mean: one moving object in an otherwise calm frame is
  // still animation, and averaging over a mostly-still frame would hide it.
  const peaks = [...bySecond.values()].map(values => Math.max(...values));
  const share = count => Number((count / peaks.length * 100).toFixed(0));
  return {
    file: videoFile,
    frames: samples.length,
    seconds: peaks.length,
    meanMotion: Number((total / samples.length).toFixed(3)),
    p90: Number(sorted[Math.floor(0.9 * (sorted.length - 1))].toFixed(3)),
    p99: Number(sorted[Math.floor(0.99 * (sorted.length - 1))].toFixed(2)),
    stillFramePercent: Number((samples.filter(sample => sample.value < 0.2).length / samples.length * 100).toFixed(1)),
    frozenSeconds: peaks.filter(value => value < 0.05).length,
    frozenPercent: share(peaks.filter(value => value < 0.05).length),
    ambientSeconds: peaks.filter(value => value >= 0.05 && value < 0.5).length,
    visibleSeconds: peaks.filter(value => value >= 0.5).length,
    visiblePercent: share(peaks.filter(value => value >= 0.5).length),
    strongSeconds: peaks.filter(value => value >= 2).length,
  };
}

const GATES = [
  { key: 'staticTailPercent', limit: 40, dir: 'max', label: 'still-picture share of runtime' },
  { key: 'changesPerMinute', limit: 8, dir: 'min', label: 'visual changes per minute' },
  { key: 'oneShotScenes', limit: 0, dir: 'max', label: 'scenes with at most one visual change', count: true },
  { key: 'worstStaticInterval', limit: 6, dir: 'max', label: 'longest frozen interval (seconds)', seconds: true },
];

// The same verdicts the CLI prints, as data — the pipeline embeds these in
// quality-report.json so every render carries its own pacing audit.
export function pacingGateResults(summary) {
  return GATES.map(gate => {
    const raw = summary[gate.key];
    const value = gate.seconds ? raw.seconds : gate.count ? raw.length : raw;
    const pass = gate.dir === 'max' ? value <= gate.limit : value >= gate.limit;
    return { name: gate.label, value, limit: `${gate.dir} ${gate.limit}`, passed: pass };
  });
}

function report(name, { summary, scenes }) {
  console.log(`\n=== ${name}`);
  console.log(`duration ${summary.durationSeconds}s · ${summary.scenes} scenes · ${summary.contentChanges} content changes · ${summary.words} spoken words`);
  console.log('scene'.padEnd(20), 'kind'.padEnd(15), 'dur'.padStart(6), 'words'.padStart(6), 'chg'.padStart(4), 'last'.padStart(6), 'still'.padStart(7), 'gap'.padStart(6));
  for (const scene of scenes) {
    console.log(
      scene.id.padEnd(20), String(scene.visual).padEnd(15),
      scene.durationSeconds.toFixed(1).padStart(6), String(scene.words).padStart(6),
      String(scene.contentChanges).padStart(4),
      (scene.lastChangeSeconds ?? 0).toFixed(1).padStart(6),
      `${scene.staticTailSeconds.toFixed(1)}s/${String(scene.staticTailPercent).padStart(2)}%`.padStart(7),
      scene.maxStaticIntervalSeconds.toFixed(1).padStart(6),
    );
  }
  console.log('');
  for (const gate of GATES) {
    const raw = summary[gate.key];
    const value = gate.seconds ? raw.seconds : gate.count ? raw.length : raw;
    const detail = gate.seconds ? ` at ${raw.atSeconds}s in ${raw.scene}` : gate.count && raw.length ? ` (${raw.join(', ')})` : '';
    const pass = gate.dir === 'max' ? value <= gate.limit : value >= gate.limit;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${gate.label}: ${value}${detail} (${gate.dir} ${gate.limit})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const videoIndex = args.indexOf('--video');
  const videos = videoIndex >= 0 ? [args[videoIndex + 1]] : [];
  const dirs = args.filter((arg, index) => !arg.startsWith('--') && (videoIndex < 0 || index !== videoIndex + 1));
  if (!dirs.length && !videos.length) {
    console.error('Usage: node tools/fair-teaching-metrics.mjs <projectDir> [more dirs] [--video <mp4>] [--json]');
    process.exit(2);
  }
  const results = [];
  for (const dir of dirs) {
    const metrics = await teachingMetrics(dir);
    results.push(metrics);
    if (!json) report(dir, metrics);
  }
  for (const video of videos) {
    const metrics = await motionMetrics(video);
    results.push(metrics);
    if (json) continue;
    console.log(`\n=== ${video}`);
    console.log(`${metrics.frames} frames · ${metrics.seconds}s · mean motion ${metrics.meanMotion} (p90 ${metrics.p90}, p99 ${metrics.p99})`);
    console.log(`per second: frozen ${metrics.frozenSeconds} (${metrics.frozenPercent}%) · ambient ${metrics.ambientSeconds} · visible ${metrics.visibleSeconds} (${metrics.visiblePercent}%) · strong ${metrics.strongSeconds}`);
    const frozenPass = metrics.frozenPercent <= 10, visiblePass = metrics.visiblePercent >= 40;
    console.log(`${frozenPass ? 'PASS' : 'FAIL'}  never frozen: ${metrics.frozenPercent}% of seconds have no visible change (max 10)`);
    console.log(`${visiblePass ? 'PASS' : 'FAIL'}  visibly animated: ${metrics.visiblePercent}% of seconds (min 40)`);
  }
  if (json) console.log(JSON.stringify(results, null, 2));
}
