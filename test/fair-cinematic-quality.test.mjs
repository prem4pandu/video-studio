import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fairCheckCinematicCandidate } from '../src/fair-cinematic-quality.mjs';
import { fairCommand } from '../src/fair-utils.mjs';

async function fixture(t, source) {
  try { await fairCommand('ffmpeg', ['-version']); await fairCommand('ffprobe', ['-version']); }
  catch { t.skip('FFmpeg and ffprobe are unavailable'); return; }
  const directory = await mkdtemp(join(tmpdir(), 'fair-cinematic-quality-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'candidate.mp4');
  await fairCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', source, '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
  const specFile = join(directory, 'qa-spec.json');
  await writeFile(specFile, JSON.stringify({ durationSeconds: 1, durationToleranceSeconds: 0.1, allowedFrameRates: [30], minimumWidth: 1280, minimumHeight: 704, requireAudio: false, maximumFreezeSeconds: 0.125, maximumBlackSeconds: 0.0834 }));
  return { file, specFile };
}

test('cinematic candidate gate accepts a moving, non-black delivery clip', async t => {
  const files = await fixture(t, 'testsrc2=s=1280x720:r=30:d=1');
  if (!files) return;
  const report = await fairCheckCinematicCandidate({ specFile: files.specFile, candidateFile: files.file });
  assert.equal(report.passed, true);
  assert.deepEqual(report.checks.filter(check => !check.passed), []);
  assert.equal(report.measurements.blackSpans.length, 0);
  assert.equal(report.measurements.freezeSpans.some(span => span.durationSeconds > 0.125), false);
});

test('cinematic candidate gate rejects black and frozen footage', async t => {
  const files = await fixture(t, 'color=c=black:s=1280x720:r=30:d=1');
  if (!files) return;
  const report = await fairCheckCinematicCandidate({ specFile: files.specFile, candidateFile: files.file });
  assert.equal(report.passed, false);
  assert.deepEqual(report.checks.filter(check => !check.passed).map(check => check.id), ['black-spans', 'freeze-spans']);
  assert.ok(report.measurements.blackSpans[0].durationSeconds > 0.9);
  assert.ok(report.measurements.freezeSpans[0].durationSeconds > 0.9);
});
