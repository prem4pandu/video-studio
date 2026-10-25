import test from 'node:test';
import assert from 'node:assert/strict';
import { fairEvaluateResponse, fairLoadDemoLearningSession, fairRecallDueAt } from '../src/fair-learning-session.mjs';

const session = await fairLoadDemoLearningSession();
const fractions = await fairLoadDemoLearningSession('equivalent-fractions');

test('learning session covers the complete teaching cycle without claiming validation', () => {
  assert.deepEqual(session.ageRange, [9, 10]);
  assert.deepEqual(new Set(session.checks.map(item => item.phase)), new Set(['readiness', 'practice', 'transfer', 'recall']));
  assert.ok(session.steps.some(item => item.phase === 'repair'));
  assert.ok(session.steps.some(item => item.phase === 'explain'));
  assert.equal(session.review.educatorApproved, false);
  assert.equal(session.review.childTested, false);
});

test('wrong responses produce misconception-specific repair routes', () => {
  const tenthsError = fairEvaluateResponse(session, 'practice', 'three-tenths');
  assert.equal(tenthsError.correct, false);
  assert.equal(tenthsError.misconception, 'Confuses tenths and hundredths');
  assert.equal(tenthsError.nextStepId, 'repair-place');
  const correct = fairEvaluateResponse(session, 'transfer', 'six-tenths');
  assert.deepEqual({ correct: correct.correct, misconception: correct.misconception, nextStepId: correct.nextStepId }, { correct: true, misconception: null, nextStepId: null });
});

test('recall scheduling is deterministic and delayed by one day', () => {
  assert.equal(fairRecallDueAt('2026-10-20T04:00:00.000Z', session.recallDelayHours), '2026-10-21T04:00:00.000Z');
});

test('the same teaching cycle supports a second topic with a different visual model', () => {
  assert.equal(fractions.id, 'equivalent-fractions-9-10');
  assert.deepEqual(new Set(fractions.checks.map(item => item.phase)), new Set(['readiness', 'practice', 'transfer', 'recall']));
  assert.ok(fractions.steps.every(item => item.model.kind === 'fraction-bars'));
  assert.equal(fairEvaluateResponse(fractions, 'practice', 'three-eighths').nextStepId, 'repair-matching-change');
  assert.equal(fairEvaluateResponse(fractions, 'transfer', 'four-sixths').correct, true);
});

test('unknown demos and impossible fraction bars fail validation', async () => {
  await assert.rejects(() => fairLoadDemoLearningSession('unknown-topic'), /Unknown demo learning session/);
  const invalid = structuredClone(fractions); invalid.steps[0].model.bars[0] = { numerator: 3, denominator: 2, label: '3/2' };
  assert.throws(() => fairEvaluateResponse(invalid, 'readiness', 'equal'), /numerator cannot exceed/i);
});
