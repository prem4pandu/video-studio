import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fairAlignSpeech, fairValidateAlignment } from '../src/fair-alignment.mjs';

test('forced alignment preserves approved punctuation and rejects missing, changed or invalid words', () => {
  const words = [{ text: 'Twentyone', startSeconds: .1, endSeconds: .5 }, { text: 'ones', startSeconds: .6, endSeconds: 1 }];
  assert.deepEqual(fairValidateAlignment('Twenty-one ones.', words, 1.1).map(word => word.text), ['Twenty-one', 'ones.']);
  assert.equal(fairValidateAlignment('Let’s', [{ text: "Let's", startSeconds: 0, endSeconds: .4 }], 1)[0].text, 'Let’s');
  assert.throws(() => fairValidateAlignment('Twenty-one ones.', words.slice(1), 1.1), /omitted/);
  assert.throws(() => fairValidateAlignment('Twenty-two ones.', words, 1.1), /mismatch/);
  for (const patch of [{ startSeconds: -.1 }, { startSeconds: .3 }, { endSeconds: .6 }, { endSeconds: 2 }, { endSeconds: NaN }]) {
    assert.throws(() => fairValidateAlignment('Twenty-one ones.', [words[0], { ...words[1], ...patch }], 1.1));
  }
});

test('alignment reuses verified timings and reruns when narration audio changes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fair-alignment-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'config.json'), '{}');
  await writeFile(join(directory, 'model.safetensors'), 'alignment weight fixture');
  const track = { sha256: 'first-audio', durationSeconds: 1, phrases: [{ text: 'Ten ones.', startSeconds: 0, endSeconds: 1 }] };
  let calls = 0;
  const options = { env: { FAIR_ALIGNMENT_MODEL_DIR: directory }, command: async (_bin, args) => {
    calls++;
    const request = JSON.parse(await readFile(args[1], 'utf8'));
    await writeFile(request.outputFile, JSON.stringify({ model: 'alignment-fixture', revision: 'test', words: [
      { text: 'Ten', startSeconds: 0, endSeconds: .4 }, { text: 'ones', startSeconds: .5, endSeconds: .9 },
    ] }));
  } };
  const file = join(directory, 'speech.wav');
  const first = await fairAlignSpeech('Ten ones.', file, track, options);
  assert.equal(first.wordTimingSource, 'forced-alignment');
  assert.equal(first.alignment.revision, 'test');
  assert.deepEqual((await fairAlignSpeech('Ten ones.', file, track, options)).words, first.words);
  assert.equal(calls, 1);
  await fairAlignSpeech('Ten ones.', file, { ...track, sha256: 'changed-audio' }, options);
  assert.equal(calls, 2);
  assert.equal(await fairAlignSpeech('Ten ones.', file, track, { env: {} }), track);
});
