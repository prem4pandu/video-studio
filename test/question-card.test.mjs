import test from 'node:test';
import assert from 'node:assert/strict';
import { fairQuestionCard } from '../src/question-card.mjs';

const question = narration => ({ beat: 'question', narration, visual: { kind: 'equation', lines: ['4 × 10 = 40'], label: 'Do not show this answer' } });

test('spoken and numeric questions show only the numeral and one highlighted digit', () => {
  for (const number of ['forty two', 'forty-two', '42']) {
    const prompt = `In ${number}, what is the value of the digit four? Think about its place.`;
    const card = fairQuestionCard(question(prompt));
    assert.ok(card);
    assert.ok(card.includes(prompt));
    assert.match(card, /aria-label="42; digit 4 highlighted"/);
    assert.equal((card.match(/data-selected-digit=/g) || []).length, 1);
    assert.doesNotMatch(card, /40|×|Do not show/);
  }
  assert.match(fairQuestionCard(question('In 42, what is the value of the digit 2?')), /data-selected-digit="2"/);
  assert.match(fairQuestionCard(question('In seventy, what is the value of the digit zero?')), /aria-label="70; digit 0 highlighted"/);
  assert.match(fairQuestionCard(question('In nineteen, what is the value of the digit nine?')), /aria-label="19; digit 9 highlighted"/);
});

test('missing, repeated, unsupported and ambiguous digits fall back to the original narration', () => {
  for (const narration of [
    'In forty two, what is the value of the digit three?',
    'In forty four, what is the value of the digit four?',
    'In forty two, what is the value of the digit twelve?',
    'In one hundred, what is the value of the digit one?',
    'In 0, what is the value of the digit zero?',
    'In 042, what is the value of the digit four?',
    'In twenty zero, what is the value of the digit two?',
    'In forty two, what is the value of the digit four? Now try twenty three.',
    'In forty two, what is the value of the digit four? Now try 23.',
    'In forty two, what is the value of the digit four? What about the other digit?',
    'In forty two, what is the value of the digit four? The answer is forty.',
    'Compare forty two and twenty four.',
    'What is four plus two?',
  ]) assert.equal(fairQuestionCard(question(narration)), null, narration);
  assert.equal(fairQuestionCard({ beat: 'answer', narration: 'In 42, what is the value of the digit 4?' }), null);
  assert.equal(fairQuestionCard(null), null);
});

test('the entire original prompt is escaped; visual fields are never used', () => {
  const card = fairQuestionCard(question('In forty two, what is the value of the digit four? <img src=x onerror=alert("oops")> & think.'));
  assert.ok(card);
  assert.match(card, /&lt;img src=x onerror=alert\(&quot;oops&quot;\)&gt; &amp; think\./);
  assert.doesNotMatch(card, /<img|<script|4 × 10|Do not show this answer/);
  assert.equal(fairQuestionCard(question('In <script>, what is the value of the digit four?')), null);
});
