import test from 'node:test';
import assert from 'node:assert/strict';
import { FAIR_RENDER_ROUTES, validateProductionPlan } from '../src/fair-production-plan.mjs';

function fixture() {
  return {
    revision: 1,
    id: 'place-value-machine',
    title: 'The Place Value Machine',
    width: 1920,
    height: 1080,
    fps: 30,
    durationSeconds: 12,
    shots: [
      {
        id: 'welcome', sceneId: 'hook', purpose: 'Introduce Mira and the machine', route: 'wan', fallbackRoute: 'deterministic',
        startSeconds: 0, durationSeconds: 5, characters: ['mira'], location: 'workshop', action: 'Mira turns toward the machine.',
        camera: { shotSize: 'wide', movement: 'push-in' }, dialogue: { speaker: 'mira', text: 'Watch what happens when every digit moves one place.' },
        overlays: [], references: ['characters/mira/three-quarter.png'], continuity: { costume: 'teacher-default', screenDirection: 'left-to-right' },
        provenance: { model: 'Wan 2.2', checkpoint: 'wan2.2-i2v', license: 'Apache-2.0', seed: 42, referenceHashes: { mira: 'a'.repeat(64) } },
      },
      {
        id: 'demonstration', sceneId: 'example', purpose: 'Show twenty three becoming two hundred and thirty', route: 'deterministic',
        startSeconds: 5, durationSeconds: 7, characters: ['mira'], location: 'workshop', action: 'The digits move one column left.',
        camera: { shotSize: 'insert', movement: 'static' },
        overlays: [{ id: 'equation', kind: 'equation', source: '23 × 10 = 230', startPhrase: 'moves one place' }], references: [],
        continuity: { costume: 'teacher-default', screenDirection: 'left-to-right', previousShotId: 'welcome' },
      },
    ],
  };
}

test('accepts a renderer-independent hybrid production plan', () => {
  const plan = validateProductionPlan(fixture());
  assert.deepEqual(FAIR_RENDER_ROUTES, ['deterministic', 'wan', 'ltx', 'kandinsky']);
  assert.equal(plan.shots[0].provenance.referenceHashes.mira, 'a'.repeat(64));
  assert.equal(plan.shots[1].continuity.previousShotId, 'welcome');
});

test('requires character references and deterministic fallback for generative shots', () => {
  const missingReference = fixture();
  missingReference.shots[0].references = [];
  assert.throws(() => validateProductionPlan(missingReference), /approved reference/);
  const missingFallback = fixture();
  delete missingFallback.shots[0].fallbackRoute;
  assert.throws(() => validateProductionPlan(missingFallback), /fallback route/i);
  const sameFallback = fixture();
  sameFallback.shots[0].fallbackRoute = 'wan';
  assert.throws(() => validateProductionPlan(sameFallback), /must differ/);
});

test('rejects absent speakers, overlapping shots and broken continuity', () => {
  const absentSpeaker = fixture();
  absentSpeaker.shots[0].dialogue.speaker = 'leo';
  assert.throws(() => validateProductionPlan(absentSpeaker), /speaker must be present/);
  const overlap = fixture();
  overlap.shots[1].startSeconds = 4;
  assert.throws(() => validateProductionPlan(overlap), /overlaps/);
  const continuity = fixture();
  continuity.shots[1].continuity.previousShotId = 'future-shot';
  assert.throws(() => validateProductionPlan(continuity), /unknown or later/);
});

test('rejects duplicate IDs, plan overruns and malformed provenance hashes', () => {
  const duplicate = fixture();
  duplicate.shots[1].id = 'welcome';
  assert.throws(() => validateProductionPlan(duplicate), /Duplicate shot ID/);
  const overrun = fixture();
  overrun.durationSeconds = 11;
  assert.throws(() => validateProductionPlan(overrun), /ends after/);
  const badHash = fixture();
  badHash.shots[0].provenance.referenceHashes.mira = 'not-a-hash';
  assert.throws(() => validateProductionPlan(badHash));
});
