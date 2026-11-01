import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../proofs/koobits-science-quality-demo/', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

test('science demo has a contiguous deterministic 160-second timeline', async () => {
  const html = await read('index.html');
  assert.match(html, /data-duration="160"/);
  const scenes = [...html.matchAll(/data-composition-src="([^"]+)" data-start="(\d+)" data-duration="(\d+)"/g)]
    .map(([, src, start, duration]) => ({ src, start: Number(start), duration: Number(duration) }))
    .filter(scene => scene.src !== 'compositions/captions.html');
  assert.deepEqual(scenes.map(({ start, duration }) => [start, duration]), [[0,12],[12,18],[30,28],[58,28],[86,20],[106,20],[126,19],[145,15]]);
  for (let i = 1; i < scenes.length; i += 1) assert.equal(scenes[i - 1].start + scenes[i - 1].duration, scenes[i].start);
  assert.equal(scenes.at(-1).start + scenes.at(-1).duration, 160);
  for (const { src } of scenes) {
    const composition = await read(src);
    assert.match(composition, /gsap\.timeline\(\{paused:true\}\)/);
    assert.doesNotMatch(composition, /fetch\(|Date\.now|Math\.random|repeat:\s*-1/);
  }
});

test('science content preserves evidence reasoning and answer holds', async () => {
  const files = await Promise.all(['SCRIPT.md','SPEC.md','REVIEW.md','compositions/predict.html','compositions/guided.html','compositions/independent.html'].map(read));
  const all = files.join('\n');
  assert.match(all, /Movement alone does not/);
  assert.match(all, /pattern of (life processes|evidence)/);
  assert.match(all, /seed can use stored food, grow and become a plant/);
  assert.match(all, /authenticated_completed/);
  assert.match(all, /E33LDe1Q8Gk/);
  assert.match(files[3], /duration:7/);
  assert.match(files[4], /duration:6/);
  assert.match(files[5], /duration:8/);
  assert.match(files[5], /\.choice:nth-child\(2\).*12\.3/s);
});

test('science demo ships local narration, music, effects, and vendored runtime', async () => {
  for (const path of ['assets/audio/voice.m4a','assets/audio/music.m4a','assets/audio/sfx.m4a','assets/vendor/gsap.min.js']) {
    const info = await stat(new URL(path, root));
    assert.ok(info.size > 1000, `${path} is unexpectedly small`);
  }
  const index = await read('index.html');
  assert.doesNotMatch(index, /https?:\/\//);
});
