import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fairRenderLesson } from '../src/fair-pipeline.mjs';
import { normalizeBrief } from '../src/fair-plan.mjs';

const text = 'Average of a set of data for ages 9–10: understand average as fair sharing and balance, calculate it as total divided by number of values, diagnose division by the largest value, practise, transfer, and retrieve.';
const brief = normalizeBrief({ text, targetSeconds: 210, provider: 'local', voiceProvider: 'qwentts', avatar: 'none', generationVersion: 'classic', footage: 'none' });
const data = [{ name: 'Ari', value: 4 }, { name: 'Bo', value: 6 }, { name: 'Chen', value: 2 }, { name: 'Devi', value: 8 }];
const lesson = {
  title: 'Average means fair share',
  audience: 'Children aged 9–10',
  curriculum: {
    requested: text,
    resolved: 'Interpret and calculate the arithmetic mean of a small set of whole-number data using redistribution and total ÷ count.',
    warnings: ['Authored benchmark; curriculum mapping and child comprehension require educator review.'],
    sources: [],
  },
  objectives: [
    { id: 'meaning', text: 'Explain an average as the equal share or balance level of a data set.' },
    { id: 'method', text: 'Calculate the mean by adding all values and dividing by the number of values.' },
    { id: 'reason', text: 'Check whether an answer is reasonable and avoid dividing by the wrong number.' },
  ],
  prerequisites: ['Add four one-digit numbers', 'Divide a multiple into equal groups', 'Read a simple block chart'],
  concept: {
    hook: 'Can four unequal towers become equal without changing the total number of blocks?',
    analogy: 'An average is the amount each person would have after everything is shared fairly.',
    arc: 'Predict, redistribute, connect the picture to total divided by count, diagnose a trap, practise, transfer, and retrieve.',
  },
  scenes: [
    {
      id: 'hook', beat: 'hook', title: 'Four towers. One fair level.', objectiveIds: ['meaning'], pauseSeconds: 4, questionId: null, mathClaims: [],
      narration: 'Ari has four blocks, Bo has six, Chen has two, and Devi has eight. Imagine they pour every block onto one table, then share them equally. Before we move anything, predict the height of every fair-share tower.',
      visual: { kind: 'average-share', items: data, mean: 5, mode: 'data', label: 'The heights are different, but the total number of blocks is fixed.' },
    },
    {
      id: 'fair-share', beat: 'concept', title: 'Move extras into the gaps', objectiveIds: ['meaning'], pauseSeconds: 1, questionId: null, mathClaims: [],
      narration: 'Look at the dashed line at five. Devi has three blocks above it, while Ari needs one and Chen needs three. Move the extra blocks into the gaps. No blocks appear or disappear. Only their positions change.',
      visual: { kind: 'average-share', items: data, mean: 5, mode: 'redistribute', label: 'The arrow points to the balance level: five blocks each.' },
    },
    {
      id: 'balanced', beat: 'example', title: 'The average is the equal share', objectiveIds: ['meaning', 'reason'], pauseSeconds: 1, questionId: null, mathClaims: [{ left: '4+6+2+8', right: '20' }],
      narration: 'Now every tower has five blocks. This equal height is the average. The original values were not all five. Five describes the fair-share level of the whole set, while the total stays twenty.',
      visual: { kind: 'average-share', items: data, mean: 5, mode: 'balanced', label: 'Same total: twenty blocks. Equal share: five blocks per person.' },
    },
    {
      id: 'calculate', beat: 'example', title: 'Add first. Then divide by how many values.', objectiveIds: ['method'], pauseSeconds: 2, questionId: null,
      mathClaims: [{ left: '4+6+2+8', right: '20' }, { left: '20/4', right: '5' }],
      narration: 'The picture gives us the calculation. First add every value: four plus six plus two plus eight equals twenty. There are four values, so divide the total by four. Twenty divided by four equals five.',
      visual: { kind: 'equation', lines: ['Total: 4 + 6 + 2 + 8 = 20', 'Count the values: 4', 'Average: 20 ÷ 4 = 5'], label: 'Average = total of the values ÷ number of values' },
    },
    {
      id: 'trap', beat: 'misconception', title: 'Do not divide by the largest value', objectiveIds: ['method', 'reason'], pauseSeconds: 2, questionId: null, mathClaims: [],
      narration: 'A common trap is dividing twenty by eight because eight is the largest value. But eight tells us a tower height, not how many towers there are. Count the data values. There are four, so the correct divisor is four.',
      visual: { kind: 'comparison', left: '20 ÷ 8 = 2.5', right: '20 ÷ 4 = 5', leftLabel: 'Wrong: divided by the largest value', rightLabel: 'Correct: divided by the number of values' },
    },
    {
      id: 'practice', beat: 'question', title: 'Your turn: find the average', objectiveIds: ['meaning', 'method', 'reason'], pauseSeconds: 10, questionId: 'practice-average', mathClaims: [],
      narration: 'The scores are three, seven, five, and five. What is their average? Add all four scores, count the four values, divide, and decide whether your answer fits between the smallest and largest score.',
      visual: { kind: 'steps', items: ['Find the total', 'Count the values', 'Divide', 'Check the range'], label: 'Pause and work it out.' },
    },
    {
      id: 'practice-answer', beat: 'answer', title: 'The average is five', objectiveIds: ['meaning', 'method', 'reason'], pauseSeconds: 1, questionId: 'practice-average',
      mathClaims: [{ left: '3+7+5+5', right: '20' }, { left: '20/4', right: '5' }],
      narration: 'Three plus seven plus five plus five equals twenty. Four values means four equal shares. Twenty divided by four is five. The answer is sensible because five lies between three and seven.',
      visual: { kind: 'equation', lines: ['3 + 7 + 5 + 5 = 20', '20 ÷ 4 = 5', 'Check: 5 is between 3 and 7'], label: 'Total, count, divide, check.' },
    },
    {
      id: 'transfer', beat: 'question', title: 'What if the average is not in the list?', objectiveIds: ['meaning', 'method', 'reason'], pauseSeconds: 10, questionId: 'transfer-average', mathClaims: [],
      narration: 'Now try two, four, and nine. The average is not one of the original values. Find the total, divide by three, and explain why an average can still be a number that never appeared in the data.',
      visual: { kind: 'steps', items: ['2 + 4 + 9 = ?', 'How many values?', 'Total ÷ count', 'Must the answer appear in the list?'], label: 'Transfer the same reasoning to three values.' },
    },
    {
      id: 'transfer-answer', beat: 'answer', title: 'The average can be a new value', objectiveIds: ['meaning', 'method', 'reason'], pauseSeconds: 1, questionId: 'transfer-average',
      mathClaims: [{ left: '2+4+9', right: '15' }, { left: '15/3', right: '5' }],
      narration: 'Two plus four plus nine is fifteen. Fifteen divided by three is five, even though five was not in the list. That is possible because the average describes the equal share, not necessarily one original data value.',
      visual: { kind: 'equation', lines: ['2 + 4 + 9 = 15', '15 ÷ 3 = 5', '5 can be the balance point without appearing in the list'], label: 'The mean describes the whole set.' },
    },
    {
      id: 'recap', beat: 'recap', title: 'Average: equal share and balance point', objectiveIds: ['meaning', 'method', 'reason'], pauseSeconds: 2, questionId: null,
      mathClaims: [],
      narration: 'Remember: combine the values to find the total, count how many values there are, divide the total by that count, then check the answer lies between the smallest and largest values. The average is the fair share and the balance level.',
      visual: { kind: 'recap', items: ['Combine: find the total', 'Count: how many values?', 'Divide: total ÷ count', 'Check: between smallest and largest'], label: 'Say the four steps from memory.' },
    },
  ],
  quality: { reviewed: false, warnings: ['Authored teaching benchmark; not yet educator-approved or child-tested.'] },
};

const directory = resolve('.fair-video', 'average-set-data-age-9-10-qwen-white');
await mkdir(directory, { recursive: true });
console.log(`Output: ${directory}`);
const result = await fairRenderLesson(lesson, brief, directory, {
  origin: 'authored',
  onProgress: event => console.log(`${event.progress ?? 0}% ${event.message}`),
});
console.log(JSON.stringify({ projectDir: result.projectDir, report: result.report }, null, 2));
