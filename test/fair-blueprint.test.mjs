import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const lesson = JSON.parse(await readFile(new URL('../content/decimal-blueprint-test.json', import.meta.url), 'utf8'));

test('instructional pilot declares its learner, scope, reasoning and honest validation status', () => {
  assert.deepEqual([lesson.audience.ageMin, lesson.audience.ageMax], [9, 10]);
  assert.equal(lesson.planningMode, 'human-curated-contract-test');
  assert.ok(lesson.learningContract.prerequisites.length >= 3);
  assert.ok(lesson.learningContract.misconceptions.length >= 3);
  assert.match(lesson.learningContract.successEvidence, /forty hundredths/);
  assert.equal(lesson.review.independentEducatorReview, false);
  assert.equal(lesson.review.childTested, false);
  const ids = lesson.beats.map(b => b.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const beat of lesson.beats) {
    for (const key of ['learnerQuestion', 'startState', 'action', 'endState', 'text']) assert.ok(beat[key]?.length > 10, `${beat.id} needs ${key}`);
    assert.ok(beat.pauseAfter >= 0 && beat.pauseAfter <= 15);
  }
});

test('practice and transfer ask for reasoning and reserve an answer-free thinking pause', () => {
  const questions = lesson.beats.filter(b => b.assessment);
  assert.equal(questions.length, 2);
  for (const beat of questions) {
    assert.ok(beat.pauseAfter >= 7);
    assert.match(beat.text, /explain/i);
    assert.equal(lesson.beats[lesson.beats.indexOf(beat) + 1].id, beat.assessment.answerBeat);
    assert.ok(beat.assessment.wrongAnswers.length >= 2);
    assert.doesNotMatch(beat.title + ' ' + beat.text, /hundredths|0\.03|sixty|greater|smaller/i);
  }
  assert.match(questions[0].text, /two point six three/);
  assert.match(questions[1].text, /zero point six and zero point zero six/);
});

test('the chosen whole supports exact tenths and hundredths without a unit-size change', () => {
  const { wholePixels, rows, columns, invariants } = lesson.representation;
  assert.equal(rows, 10);
  assert.equal(columns, 10);
  const cellArea = (wholePixels / rows) * (wholePixels / columns);
  const tenthArea = wholePixels * (wholePixels / columns);
  assert.equal(tenthArea, 10 * cellArea);
  assert.equal(wholePixels ** 2, 100 * cellArea);
  assert.ok(4 * tenthArea > 7 * cellArea);
  assert.match(invariants.join(' '), /same boundary, position and size/);
  assert.ok(lesson.beats.findIndex(b => b.id === 'unit-bridge') < lesson.beats.findIndex(b => b.id === 'four-tenths'));
  assert.ok(lesson.beats.findIndex(b => b.id === 'four-tenths') < lesson.beats.findIndex(b => b.id === 'compare'));
});
