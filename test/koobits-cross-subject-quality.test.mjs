import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const roots = {
  science: resolve('proofs/koobits-science-quality-demo'),
  english: resolve('proofs/koobits-english-quality-demo'),
};
const read = (subject, file) => readFile(join(roots[subject], file), 'utf8');

function timeline(index) {
  return [...index.matchAll(/data-composition-id="([^"]+)"[^>]+data-composition-src="([^"]+)"[^>]+data-start="([\d.]+)"[^>]+data-duration="([\d.]+)"/g)]
    .map(match => ({ id: match[1], file: match[2], start: Number(match[3]), duration: Number(match[4]) }));
}

function captions(source) {
  return [...source.matchAll(/<div\b([^>]*)>\s*<span(?:\s[^>]*)?>([\s\S]*?)<\/span\s*>/g)]
    .filter(match => /class="[^"]*\b(?:cap|caption)\b/.test(match[1]))
    .map(match => ({
      start: Number(match[1].match(/data-start="([\d.]+)"/)?.[1]),
      duration: Number(match[1].match(/data-duration="([\d.]+)"/)?.[1]),
      text: match[2].replace(/<[^>]*>/g, ''),
    }));
}

function eventAt(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Number(source.match(new RegExp(`(?:fromTo|to)\\(\\s*["']${escaped}["'][\\s\\S]*?\\},\\s*([\\d.]+),?\\s*\\)`))?.[1]);
}

async function assertDelivery(subject, expectedDuration, expectedScenes) {
  const [index, captionSource] = await Promise.all([read(subject, 'index.html'), read(subject, 'compositions/captions.html')]);
  const root = index.match(/<div\b[^>]*\bid="root"[^>]*>/)?.[0] || '';
  assert.equal(Number(root.match(/data-duration="([\d.]+)"/)?.[1]), expectedDuration);

  const scenes = timeline(index);
  assert.deepEqual(scenes.filter(scene => scene.id !== 'captions').map(scene => scene.id), expectedScenes);
  assert.equal(scenes[0].start, 0);
  const teaching = scenes.filter(scene => scene.id !== 'captions');
  teaching.forEach((scene, position) => {
    if (position) assert.equal(scene.start, teaching[position - 1].start + teaching[position - 1].duration, `${subject}:${scene.id} must follow the prior scene exactly`);
  });
  assert.equal(teaching.at(-1).start + teaching.at(-1).duration, expectedDuration);

  assert.match(index, /data-composition-id="captions"[^>]+data-track-kind="captions"/);
  const audio = [...index.matchAll(/<audio\b[^>]+src="([^"]+)"[^>]*>/g)].map(match => match[1]);
  assert.ok(audio.length >= 1, `${subject} must mount voice audio`);
  assert.ok(audio.some(path => /voice|narration/i.test(path)), `${subject} must identify its voice track`);

  const cues = captions(captionSource);
  assert.ok(cues.length >= 10, `${subject} must provide timed captions`);
  assert.equal(cues[0].start, 0);
  cues.forEach((cue, position) => {
    assert.ok(cue.duration > 0 && cue.text.trim(), `${subject} caption ${position + 1} must be nonempty`);
    if (position) assert.equal(cue.start, cues[position - 1].start + cues[position - 1].duration, `${subject} captions must have no gap or overlap`);
  });
  assert.equal(cues.at(-1).start + cues.at(-1).duration, expectedDuration);

  const sources = new Set(audio);
  for (const scene of scenes) sources.add(scene.file);
  for (const path of sources) {
    const info = await stat(join(roots[subject], path));
    assert.ok(info.isFile() && info.size > 0, `${subject} local asset ${path} must exist and be nonempty`);
  }
  for (const [owner, source] of [['index.html', index], ['compositions/captions.html', captionSource]]) {
    assert.doesNotMatch(source, /(?:src|href)="(?:https?:)?\/\//i, `${subject}:${owner} must not depend on the network`);
  }
  return { index, cues };
}

test('science demo implements prediction → evidence → comparison → transfer without answer leakage', async () => {
  const { cues } = await assertDelivery('science', 160, [
    'hook', 'predict', 'evidence', 'compare', 'misconception', 'guided', 'independent', 'recap',
  ]);
  const [predict, evidence, compare, misconception, guided, independent] = await Promise.all([
    read('science', 'compositions/predict.html'), read('science', 'compositions/evidence.html'),
    read('science', 'compositions/compare.html'), read('science', 'compositions/misconception.html'),
    read('science', 'compositions/guided.html'), read('science', 'compositions/independent.html'),
  ]);

  assert.match(predict, /Living<\/div>[\s\S]*Non-living<\/div>[\s\S]*Need evidence<\/div>/);
  assert.match(predict, /#answer\{opacity:0\}/);
  assert.ok(12 + eventAt(predict, '#answer') >= 24, 'prediction feedback must wait until the 17–24 s response window ends');
  assert.doesNotMatch(cues.find(cue => cue.start === 17)?.text || '', /non-living|need more evidence/i);

  for (const phrase of ['Need resources', 'Grow from within', 'Produce new living things of their kind', 'Respond to their surroundings']) assert.match(evidence, new RegExp(phrase, 'i'));
  assert.match(compare, /Plant[\s\S]*Robot/);
  assert.match(compare, /Robot: non-living/);
  assert.match(misconception, /Movement alone does not mean [“"]living[”"]/);

  assert.match(guided, /dry seed does not move\. Is it living\?/i);
  assert.match(guided, /id="verdict"[^>]*>Living — it can grow/);
  assert.ok(106 + eventAt(guided, '#verdict') >= 117, 'guided seed verdict must wait for the response window');
  assert.doesNotMatch(cues.find(cue => cue.start === 111)?.text || '', /it is living/i);

  assert.match(independent, /bicycle moves when a rider pedals/i);
  assert.match(independent, /id="verdict"[^>]*>Non-living — motion needs a rider/);
  assert.ok(126 + eventAt(independent, '#verdict') >= 138, 'independent bicycle verdict must wait until the response window ends');
  for (const cue of cues.filter(cue => cue.start >= 126 && cue.start < 138)) assert.doesNotMatch(cue.text, /it is non-living|motion needs/i);
});

test('English demo makes spelling, sound and meaning manipulable before independent feedback', async () => {
  const { cues } = await assertDelivery('english', 155, [
    'hook', 'notice', 'model', 'sort', 'guided', 'respond', 'recap',
  ]);
  const [notice, model, sort, guided, respond] = await Promise.all([
    read('english', 'compositions/notice.html'), read('english', 'compositions/model.html'),
    read('english', 'compositions/sort.html'), read('english', 'compositions/guided.html'),
    read('english', 'compositions/respond.html'),
  ]);

  assert.match(notice, /cap[\s\S]*short a[\s\S]*cape[\s\S]*long a/i);
  assert.match(notice, /final e is silent\. The vowel changes/i);
  assert.match(model, /kit → kite/);
  assert.match(model, /short i[\s\S]*long i/i);
  assert.match(model, /kit: a set of tools[\s\S]*kite: something that flies/i);
  assert.match(model, /id="model-e"[^>]*class="tile magic"/);

  for (const word of ['cap', 'kit', 'cape', 'kite']) assert.match(sort, new RegExp(`class="word-chip">${word}<`));
  assert.match(sort, /Short vowel[\s\S]*Long vowel \+ silent e/);
  assert.match(guided, /tap \+ e = <span id="guided-answer">tape<\/span>/);

  assert.match(respond, /hop \+ \?/);
  assert.match(respond, /id="respond-result">hop \+ e = hope<\/div>/);
  const answerAt = eventAt(respond, '#respond-result');
  assert.ok(answerAt >= 15, 'hop → hope feedback must remain hidden for the ten-second learner response window');
  for (const cue of cues.filter(cue => cue.start >= 115 && cue.start < 130)) assert.doesNotMatch(cue.text, /hope|add (?:an? )?e/i);
  assert.match(cues.find(cue => cue.start === 130)?.text || '', /hope/i, 'answer caption should begin only when feedback starts');
});
