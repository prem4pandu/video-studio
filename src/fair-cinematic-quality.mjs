import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand, fairFileHash, fairWriteJson } from './fair-utils.mjs';

function rate(stream) {
  const [numerator, denominator] = String(stream?.avg_frame_rate || stream?.r_frame_rate || '').split('/').map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : Number.NaN;
}

function spans(stderr, kind, mediaDurationSeconds) {
  if (kind === 'black') return [...stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)].map(match => ({ startSeconds: Number(match[1]), endSeconds: Number(match[2]), durationSeconds: Number(match[3]) }));
  const starts = [...stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map(match => Number(match[1]));
  const ends = [...stderr.matchAll(/freeze_end:\s*([\d.]+)/g)].map(match => Number(match[1]));
  const durations = [...stderr.matchAll(/freeze_duration:\s*([\d.]+)/g)].map(match => Number(match[1]));
  return starts.map((startSeconds, index) => {
    const endSeconds = ends[index] ?? mediaDurationSeconds;
    return { startSeconds, endSeconds, durationSeconds: durations[index] ?? endSeconds - startSeconds };
  });
}

async function probe(file, { env, signal, command }) {
  const result = await command(env.FAIR_FFPROBE || 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { env, signal });
  return JSON.parse(result.stdout);
}

export async function fairCheckCinematicCandidate({ specFile, candidateFile, env = process.env, signal, command = fairCommand } = {}) {
  const spec = JSON.parse(await readFile(resolve(specFile), 'utf8'));
  const file = resolve(candidateFile);
  const media = await probe(file, { env, signal, command });
  const video = media.streams?.find(stream => stream.codec_type === 'video');
  const audio = media.streams?.find(stream => stream.codec_type === 'audio');
  const durationSeconds = Number(media.format?.duration);
  const fps = rate(video);
  let decodeError = '';
  try { await command(env.FAIR_FFMPEG || 'ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { env, signal }); }
  catch (error) { decodeError = error.message; }
  const black = await command(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', 'blackdetect=d=0.01:pix_th=0.10', '-f', 'null', '-'], { env, signal });
  const freeze = await command(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', 'freezedetect=n=-60dB:d=0.01', '-f', 'null', '-'], { env, signal });
  const blackSpans = spans(black.stderr, 'black', durationSeconds);
  const freezeSpans = spans(freeze.stderr, 'freeze', durationSeconds);
  const maximumBlack = Number(spec.maximumBlackSeconds);
  const maximumFreeze = Number(spec.maximumFreezeSeconds);
  const checks = [
    { id: 'decode-integrity', passed: !decodeError, detail: decodeError || 'Every video frame decodes without an FFmpeg error.' },
    { id: 'video-stream', passed: Boolean(video), detail: video ? `${video.codec_name || 'unknown'} video stream present.` : 'Video stream missing.' },
    { id: 'duration', passed: Number.isFinite(durationSeconds) && Math.abs(durationSeconds - Number(spec.durationSeconds)) <= Number(spec.durationToleranceSeconds), detail: `Expected ${spec.durationSeconds}s ± ${spec.durationToleranceSeconds}s; measured ${Number.isFinite(durationSeconds) ? `${durationSeconds.toFixed(3)}s` : 'unavailable'}.` },
    { id: 'resolution', passed: Boolean(video) && video.width >= Number(spec.minimumWidth) && video.height >= Number(spec.minimumHeight), detail: `Required at least ${spec.minimumWidth}x${spec.minimumHeight}; measured ${video ? `${video.width}x${video.height}` : 'unavailable'}.` },
    { id: 'frame-rate', passed: Number.isFinite(fps) && spec.allowedFrameRates.some(expected => Math.abs(fps - expected) <= 0.05), detail: `Allowed ${spec.allowedFrameRates.join(' or ')} fps; measured ${Number.isFinite(fps) ? fps.toFixed(3) : 'unavailable'}.` },
    { id: 'audio-stream', passed: !spec.requireAudio || Boolean(audio), detail: audio ? `${audio.codec_name || 'unknown'} audio stream present.` : spec.requireAudio ? 'Required audio stream missing.' : 'Audio is optional for this candidate.' },
    { id: 'black-spans', passed: Number.isFinite(maximumBlack) && blackSpans.every(span => span.durationSeconds <= maximumBlack), detail: `Maximum allowed ${maximumBlack}s; longest measured ${blackSpans.length ? Math.max(...blackSpans.map(span => span.durationSeconds)).toFixed(3) : '0.000'}s.` },
    { id: 'freeze-spans', passed: Number.isFinite(maximumFreeze) && freezeSpans.every(span => span.durationSeconds <= maximumFreeze), detail: `Maximum allowed ${maximumFreeze}s; longest measured ${freezeSpans.length ? Math.max(...freezeSpans.map(span => span.durationSeconds)).toFixed(3) : '0.000'}s.` },
  ];
  const info = await stat(file);
  return {
    revision: 1,
    candidate: candidateFile,
    spec: specFile,
    passed: checks.every(check => check.passed),
    checks,
    measurements: { durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null, width: video?.width ?? null, height: video?.height ?? null, fps: Number.isFinite(fps) ? fps : null, hasAudio: Boolean(audio), bytes: info.size, sha256: await fairFileHash(file), blackSpans, freezeSpans },
  };
}

async function main() {
  const specFile = process.argv[2] || 'proofs/cinematic-benchmark/qa-spec.json';
  const candidateFile = process.argv[3] || 'proofs/cinematic-benchmark/candidate.mp4';
  const reportFile = process.argv[4] ? resolve(process.argv[4]) : resolve(dirname(specFile), 'automated-quality-report.json');
  const report = await fairCheckCinematicCandidate({ specFile, candidateFile });
  await fairWriteJson(reportFile, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
