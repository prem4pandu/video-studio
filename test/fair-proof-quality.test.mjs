import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fairAssessProofVideo } from '../src/fair-proof-quality.mjs';
import { fairCommand } from '../src/fair-utils.mjs';

test('proof-film quality gate accepts a correctly encoded audiovisual master', async t => {
  try { await fairCommand('ffmpeg', ['-version']); await fairCommand('ffprobe', ['-version']); }
  catch { t.skip('FFmpeg and ffprobe are unavailable'); return; }
  const directory = await mkdtemp(join(tmpdir(), 'fair-proof-quality-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'proof.mp4');
  await fairCommand('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0x152436:s=1920x1080:r=30:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', file,
  ]);
  const report = await fairAssessProofVideo(file, { expectedDurationSeconds: 1, durationToleranceSeconds: 0.1 });
  assert.equal(report.passed, true);
  assert.deepEqual(report.checks.filter(check => !check.passed), []);
  assert.equal(report.measurements.width, 1920);
  assert.equal(report.measurements.height, 1080);
  assert.ok(Math.abs(report.measurements.fps - 30) < 0.01);
  assert.ok(report.measurements.meanVolumeDb > -60);
  assert.match(report.measurements.sha256, /^[a-f0-9]{64}$/);
});

test('proof-film quality gate reports each delivery failure without throwing', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fair-proof-quality-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'fixture.bin');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(file, 'fixture'));
  const report = await fairAssessProofVideo(file, {
    expectedDurationSeconds: 60,
    probe: async () => ({ format: { duration: '58' }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, avg_frame_rate: '24/1' }] }),
    command: async () => { throw new Error('volume analysis should not run without audio'); },
  });
  assert.equal(report.passed, false);
  assert.deepEqual(report.checks.filter(check => !check.passed).map(check => check.id), ['delivery-size', 'frame-rate', 'duration', 'audio-stream', 'non-silent-audio']);
  assert.equal(report.measurements.meanVolumeDb, null);
});
