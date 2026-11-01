import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand, fairFileHash } from './fair-utils.mjs';

async function probeMedia(file, { env = process.env, signal } = {}) {
  const { stdout } = await fairCommand(env.FAIR_FFPROBE || 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { env, signal });
  return JSON.parse(stdout);
}

function frameRate(stream) {
  const [numerator, denominator] = String(stream?.avg_frame_rate || stream?.r_frame_rate || '').split('/').map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : Number.NaN;
}

export async function fairAssessProofVideo(file, {
  env = process.env,
  signal,
  expectedDurationSeconds = 60,
  durationToleranceSeconds = 0.5,
  expectedWidth = 1920,
  expectedHeight = 1080,
  expectedFps = 30,
  fpsTolerance = 0.05,
  minimumMeanVolumeDb = -60,
  probe = probeMedia,
  command = fairCommand,
} = {}) {
  const media = await probe(file, { env, signal });
  const video = media.streams?.find(stream => stream.codec_type === 'video');
  const audio = media.streams?.find(stream => stream.codec_type === 'audio');
  const durationSeconds = Number(media.format?.duration);
  const fps = frameRate(video);
  let meanVolumeDb = Number.NaN;
  if (audio) {
    const volume = await command(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { env, signal });
    meanVolumeDb = Number(volume.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
  }

  const checks = [
    { id: 'video-stream', passed: Boolean(video), detail: video ? `${video.codec_name || 'unknown'} video stream present` : 'Video stream missing' },
    { id: 'delivery-size', passed: video?.width === expectedWidth && video?.height === expectedHeight, detail: `Expected ${expectedWidth}x${expectedHeight}; measured ${video ? `${video.width}x${video.height}` : 'unavailable'}` },
    { id: 'frame-rate', passed: Number.isFinite(fps) && Math.abs(fps - expectedFps) <= fpsTolerance, detail: `Expected ${expectedFps} fps; measured ${Number.isFinite(fps) ? fps.toFixed(3) : 'unavailable'}` },
    { id: 'duration', passed: Number.isFinite(durationSeconds) && Math.abs(durationSeconds - expectedDurationSeconds) <= durationToleranceSeconds, detail: `Expected ${expectedDurationSeconds}s ± ${durationToleranceSeconds}s; measured ${Number.isFinite(durationSeconds) ? `${durationSeconds.toFixed(3)}s` : 'unavailable'}` },
    { id: 'audio-stream', passed: Boolean(audio), detail: audio ? `${audio.codec_name || 'unknown'} audio stream present` : 'Audio stream missing' },
    { id: 'non-silent-audio', passed: Boolean(audio) && Number.isFinite(meanVolumeDb) && meanVolumeDb > minimumMeanVolumeDb, detail: `Required mean volume above ${minimumMeanVolumeDb} dBFS; measured ${Number.isFinite(meanVolumeDb) ? `${meanVolumeDb.toFixed(1)} dBFS` : 'unavailable'}` },
  ];
  const fileInfo = await stat(file);
  return {
    revision: 1,
    passed: checks.every(check => check.passed),
    checks,
    measurements: {
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps: Number.isFinite(fps) ? fps : null,
      meanVolumeDb: Number.isFinite(meanVolumeDb) ? meanVolumeDb : null,
      bytes: fileInfo.size,
      sha256: await fairFileHash(file),
    },
  };
}

async function main() {
  const file = resolve(process.argv[2] || 'proofs/place-value-machine/out.mp4');
  const expectedDurationSeconds = Number(process.argv[3] || 60);
  if (!Number.isFinite(expectedDurationSeconds) || expectedDurationSeconds <= 0) throw new Error('Expected duration must be a positive number of seconds.');
  const report = await fairAssessProofVideo(file, { expectedDurationSeconds });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
