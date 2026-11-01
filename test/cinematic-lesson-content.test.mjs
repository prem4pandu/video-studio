import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const project = resolve('proofs/cinematic-lesson');
const read = file => readFile(join(project, file), 'utf8');
const attribute = (source, name) => Number(source.match(new RegExp(`${name}="([\\d.]+)"`))?.[1]);
const occurrence = (source, value) => source.split(value).length - 1;

test('cinematic lesson preserves exact mathematics, reveal order, timing, audio and assets', async () => {
  const [index, establish, shift, result] = await Promise.all([
    read('index.html'), read('compositions/establish.html'), read('compositions/shift.html'), read('compositions/resolve.html'),
  ]);

  assert.equal(attribute(index.match(/<div\b[^>]*\bid="root"[^>]*>/)?.[0] || '', 'data-duration'), 14, 'master duration must remain fourteen seconds');
  const sceneSlots = [...index.matchAll(/data-composition-src="([^"]+)"[^>]+data-start="([\d.]+)"[^>]+data-duration="([\d.]+)"/g)]
    .map(match => ({ file: match[1], start: Number(match[2]), duration: Number(match[3]) }));
  assert.deepEqual(sceneSlots, [
    { file: 'compositions/establish.html', start: 0, duration: 4 },
    { file: 'compositions/shift.html', start: 4, duration: 5 },
    { file: 'compositions/resolve.html', start: 9, duration: 5 },
  ]);
  assert.equal(sceneSlots.at(-1).start + sceneSlots.at(-1).duration, 14, 'scene timeline must fill the master without overrun');

  assert.match(establish, />Start with 23</);
  for (const value of ['>23</span>', '>2 tens</span>', '>3 ones</span>']) assert.ok(establish.includes(value), `${value} must remain in the setup`);
  for (const label of ['Hundreds', 'Tens', 'Ones']) assert.match(shift, new RegExp(`>${label}<`));
  assert.match(shift, /id="shift-two"[^>]*>2<\/div>/);
  assert.match(shift, /id="shift-three"[^>]*>3<\/div>/);
  assert.match(shift, /id="shift-zero"[^>]*>0<\/div>/);
  assert.match(result, /23 × 10 = <strong\b[^>]*>230<\/strong>/);
  assert.match(result, />2 hundreds \+ 3 tens \+ 0 ones</);
  assert.match(result, /The digits shift\. Zero holds the empty place\./);

  assert.equal(occurrence(establish, '230'), 0, 'answer must not appear in the setup');
  assert.equal(occurrence(shift, '230'), 0, 'answer must not appear before the shift completes');
  const shiftAt = Number(shift.match(/\.to\('#shift-two, #shift-three',[\s\S]*?\},\s*([\d.]+)\)/)?.[1]);
  const zeroAt = Number(shift.match(/\.fromTo\('#shift-zero',[\s\S]*?\},\s*([\d.]+)\)/)?.[1]);
  assert.ok(Number.isFinite(shiftAt) && Number.isFinite(zeroAt) && shiftAt < zeroAt, 'digits must shift before zero and the result are revealed');
  assert.equal(sceneSlots.find(scene => scene.file.endsWith('resolve.html')).start, 9, 'final answer belongs only in the resolve scene');

  const audioTags = [...index.matchAll(/<audio\b[^>]*>/g)].map(match => match[0]);
  assert.ok(audioTags.length >= 1, 'the lesson must mount narration/audio tracks');
  const voice = audioTags.find(tag => /id="voice/.test(tag) || /src="assets\/audio\/voice\.wav"/.test(tag));
  assert.ok(voice, 'the canonical narration track must be present');
  assert.match(voice, /data-start="0"/);
  assert.match(voice, /data-duration="14"/);

  const sources = new Set();
  for (const source of [index, establish, shift, result]) {
    for (const match of source.matchAll(/(?:src|data-composition-src)="([^"]+)"/g)) sources.add(match[1]);
  }
  for (const asset of sources) {
    const info = await stat(join(project, asset));
    assert.ok(info.isFile() && info.size > 0, `${asset} must exist and be nonempty`);
  }
});
