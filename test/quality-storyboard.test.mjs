import assert from 'node:assert/strict';
import test from 'node:test';
import { fairQualityProof, fairQualityScenePlan } from '../src/quality-storyboard.mjs';

test('quality events use provider word anchors and name every visual target', () => {
  const scene = { id: 'model', beat: 'example', pauseSeconds: 0 };
  const track = { durationSeconds: 5, wordTimingSource: 'qwen-alignment', words: [
    { text: 'Watch', startSeconds: 0.1 }, { text: 'the', startSeconds: 0.4 },
    { text: 'first', startSeconds: 1.2 }, { text: 'step', startSeconds: 2.4 },
    { text: 'now', startSeconds: 3.8 },
  ] };
  const qualityPlan = fairQualityScenePlan(scene, track, 3);
  assert.equal(qualityPlan.timingSource, 'qwen-alignment');
  assert.deepEqual(qualityPlan.events.filter(event => event.kind === 'reveal').map(event => event.target), ['reveal-0', 'reveal-1', 'reveal-2']);
  assert.ok(qualityPlan.events.every(event => event.target));
  assert.ok(qualityPlan.events.every((event, index, events) => !index || event.at >= events[index - 1].at));
});

test('quality proof records protected learner response windows', () => {
  const scene = { id: 'practice', beat: 'question', pauseSeconds: 8 };
  scene.qualityPlan = fairQualityScenePlan(scene, { durationSeconds: 4, words: [] }, 1);
  const proof = fairQualityProof([scene]);
  assert.equal(proof.treatment, 'approved-proof-port-v2');
  assert.equal(proof.semanticTargets, true);
  assert.equal(proof.progressiveReveal, true);
  assert.equal(proof.protectedResponses, true);
  const events = proof.scenes[0].events;
  assert.ok(events.find(event => event.kind === 'response-close').at > events.find(event => event.kind === 'response-open').at);
});
