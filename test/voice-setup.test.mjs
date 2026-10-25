import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FAIR_VOICE_INSTALL, fairVerifyVoiceAsset } from '../scripts/setup-voice.mjs';

test('setup rejects missing, truncated and altered model bytes before activating a downloaded asset', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fair-voice-setup-'));
  try {
    const path = join(directory, 'model'), content = Buffer.from('explicit integrity fixture');
    const expected = { bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
    assert.equal(await fairVerifyVoiceAsset(path, expected), false);
    await writeFile(path, content); assert.equal(await fairVerifyVoiceAsset(path, expected), true);
    await writeFile(path, content.subarray(0, -1)); assert.equal(await fairVerifyVoiceAsset(path, expected), false);
    const altered = Buffer.from(content); altered[2] ^= 1;
    await writeFile(path, altered); assert.equal(await fairVerifyVoiceAsset(path, expected), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('setup manifest pins the model revision, both integrity hashes and runtime versions with licenses', () => {
  assert.match(FAIR_VOICE_INSTALL.revision, /^[a-f0-9]{40}$/);
  assert.equal(FAIR_VOICE_INSTALL.modelLicense, 'AGPL-3.0');
  assert.equal(FAIR_VOICE_INSTALL.runtimeLicense, 'GPL-3.0');
  assert.equal(FAIR_VOICE_INSTALL.runtime['piper-tts'], '1.4.1');
  assert.equal(FAIR_VOICE_INSTALL.runtime.soundfile, '0.13.1');
  assert.equal(FAIR_VOICE_INSTALL.files.length, 2);
  for (const file of FAIR_VOICE_INSTALL.files) { assert.match(file.sha256, /^[a-f0-9]{64}$/); assert.ok(file.bytes > 0); }
});
