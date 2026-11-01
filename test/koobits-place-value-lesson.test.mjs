import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const project = resolve('proofs/koobits-place-value-lesson');
const read = file => readFile(join(project, file), 'utf8');
const count = (source, value) => source.split(value).length - 1;
const at = (source, selector) => Number(source.match(new RegExp(`(?:fromTo|to)\\('${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'[\\s\\S]*?\\},\\s*([\\d.]+)\\)`))?.[1]);
const toAt = (source, selector) => Number(source.match(new RegExp(`\\.to\\('${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'[\\s\\S]*?\\},\\s*([\\d.]+)\\)`))?.[1]);
const setAt = (source, selector) => Number(source.match(new RegExp(`\\.set\\('${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'[\\s\\S]*?\\},\\s*([\\d.]+)\\)`))?.[1]);

test('KooBits place-value lesson is a complete, offline 23 × 10 learning loop', async () => {
  const narrationBuilder = await readFile(resolve('scripts/render-koobits-narration.mjs'), 'utf8');
  const files = {
    index: 'index.html',
    hook: 'compositions/hook.html',
    goal: 'compositions/goal.html',
    build: 'compositions/build-23.html',
    predict: 'compositions/predict.html',
    prove: 'compositions/prove-23.html',
    misconception: 'compositions/misconception.html',
    guided: 'compositions/guided-41.html',
    independent: 'compositions/independent-47.html',
    recap: 'compositions/recap.html',
  };
  const source = Object.fromEntries(await Promise.all(
    Object.entries(files).map(async ([name, file]) => [name, await read(file)]),
  ));

  const rootTag = source.index.match(/<div\b[^>]*\bid="root"[^>]*>/)?.[0] || '';
  const duration = Number(rootTag.match(/data-duration="([\d.]+)"/)?.[1]);
  assert.ok(duration >= 240 && duration <= 420, 'complete lesson must run for 4–7 minutes');

  const scenes = [...source.index.matchAll(/data-composition-id="([^"]+)"[^>]+data-composition-src="([^"]+)"[^>]+data-start="([\d.]+)"[^>]+data-duration="([\d.]+)"/g)]
    .map(match => ({ id: match[1], file: match[2], start: Number(match[3]), duration: Number(match[4]) }))
    .filter(scene => scene.id !== 'captions');
  assert.deepEqual(scenes.map(scene => scene.id).filter(id => !id.startsWith('hook-split')), [
    'hook', 'goal', 'build-23', 'predict', 'prove-23', 'misconception', 'guided-41', 'independent-47', 'recap',
  ], 'lesson must preserve the ordered hook → goal → model → predict → proof → repair → guided → independent → recap loop');
  assert.equal(scenes[0].start, 0);
  scenes.forEach((scene, index) => {
    if (index) assert.equal(scene.start, scenes[index - 1].start + scenes[index - 1].duration, `${scene.id} must start when the prior scene ends`);
  });
  assert.equal(scenes.at(-1).start + scenes.at(-1).duration, duration, 'scene timeline must exactly fill the lesson');

  assert.match(source.goal, /Explain ×10 using place value/);
  assert.match(source.build, /23 means 2 tens and 3 ones/);
  assert.equal((source.build.match(/class="ten"/g) ?? []).length, 2, '23 must contain exactly two ten-rods');
  assert.equal((source.build.match(/class="one"/g) ?? []).length, 3, '23 must contain exactly three unit cubes');
  assert.match(source.build, />2 tens = 20<\/div>/);
  assert.match(source.build, />3 ones = 3<\/div>/);
  assert.match(source.build, /23 = <span[^>]*>2 tens<\/span> \+ <span[^>]*>3 ones<\/span>/);
  for (const label of ['Hundreds', 'Tens', 'Ones']) assert.match(source.prove, new RegExp(`>${label}<`));
  assert.match(source.prove, /id="prove23-two"[^>]*>2<\/div>/);
  assert.match(source.prove, /id="prove23-three"[^>]*>3<\/div>/);
  assert.match(source.prove, /id="prove23-zero"[^>]*>0<\/div>/);
  assert.match(source.prove, /23 × 10 = <span[^>]*>230<\/span>/);

  assert.equal(count(source.build, '230'), 0, 'the model scene must not reveal the result');
  assert.equal(count(source.predict, '230'), 0, 'prediction must not reveal the numeric answer');
  const choicesAt = at(source.predict, '.choice');
  const predictionRevealAt = Number(source.predict.match(/\.to\('\.choice:nth-child\(2\)'[\s\S]*?\},\s*([\d.]+)\)/)?.[1]);
  assert.ok(Number.isFinite(choicesAt) && predictionRevealAt - choicesAt >= 3, 'prediction needs at least three seconds before its correct option is revealed');
  assert.ok(predictionRevealAt >= 16, 'prediction feedback must wait until the narrated think window ends');

  const shiftAt = at(source.prove, '#prove23-two, #prove23-three');
  const emptyAt = at(source.prove, '#prove23-empty');
  const zeroAt = at(source.prove, '#prove23-zero');
  const resultAt = at(source.prove, '#prove23-eq');
  assert.ok(shiftAt < emptyAt && emptyAt < zeroAt && zeroAt < resultAt, 'digits must shift, expose the empty ones place, receive zero, then reveal 230');
  assert.ok(shiftAt >= 24 && emptyAt >= 30 && zeroAt >= 34 && resultAt >= 37, 'proof actions must follow their narration anchors');

  assert.match(source.misconception, /[“\"]Just add a zero[”\"]/);
  assert.match(source.misconception, /fails with decimals/i);
  assert.match(source.misconception, /The 2 and 3 move first\. Then zero holds the empty ones place\./);
  assert.match(source.misconception, /Digits shift\. Zero is a placeholder\./);

  assert.match(source.guided, /Guided example/);
  assert.match(source.guided, /41 × 10 = \?/);
  assert.match(source.guided, /41 × 10 = 410/);
  assert.match(narrationBuilder, /row\.end - row\.start - 0\.2/, 'narration must reserve silence before the next cue');
  assert.match(narrationBuilder, /atrim=0:\$\{row\.budget\.toFixed\(3\)\}/, 'every generated line must be trimmed to its authored cue window');
  assert.match(narrationBuilder, /rate > 1\.18/, 'copy that cannot fit naturally must fail instead of overlapping the next voice');
  assert.match(source.independent, /Independent example/);
  assert.match(source.independent, /47 × 10 = <span[^>]*class="answer-line"[^>]*><\/span>/);
  assert.match(source.independent, /id="independent-answer"[^>]*>47 × 10 = 470<\/div>/);
  assert.match(source.independent, /#independent-answer[^}]*opacity:\s*0/);
  const independentPromptAt = 0;
  const independentRevealAt = at(source.independent, '#independent-answer');
  const independentShiftAt = at(source.independent, '#independent-four, #independent-seven');
  const independentZeroAt = at(source.independent, '#independent-zero');
  assert.ok(independentRevealAt - independentPromptAt >= 8, 'independent answer must remain hidden for a meaningful response window');
  assert.ok(independentShiftAt < independentZeroAt && independentZeroAt < independentRevealAt, 'independent model must withhold 470 until after the learner action');
  assert.ok(independentShiftAt >= 30, 'independent digits must not move during thinking or commitment');
  assert.ok(independentZeroAt >= 35, 'independent zero must wait for its narration');
  assert.ok(independentRevealAt >= 45, 'independent answer must wait for the narrated reveal');

  const guidedFourAt = toAt(source.guided, '#guided-four');
  const guidedOneAt = toAt(source.guided, '#guided-one');
  const guidedZeroAt = at(source.guided, '#guided-zero');
  const guidedAnswerAt = setAt(source.guided, '.title');
  assert.ok(guidedFourAt >= 18 && guidedOneAt >= 30, 'guided digit moves must follow their separate response windows');
  assert.ok(guidedZeroAt >= 40 && guidedAnswerAt >= 43, 'guided zero and answer must not leak into the final response window');

  for (const [name, html] of [['build', source.build], ['prove', source.prove], ['guided', source.guided], ['independent', source.independent]]) {
    assert.match(html, /class="attention-pointer"/, `${name} must include a purposeful visual pointer`);
    assert.match(html, /attention-label/, `${name} pointer must name the current referent`);
  }

  const audioTags = [...source.index.matchAll(/<audio\b[^>]*>/g)].map(match => match[0]);
  assert.ok(audioTags.length >= 1, 'narration/audio must be mounted in the master composition');
  assert.ok(audioTags.some(tag => /data-track-kind="(?:narration|voice|audio)"/.test(tag) || /(?:voice|narration)/i.test(tag)), 'a narration track must be identifiable');
  const hasMountedCaptions = /<track\b[^>]*kind="captions"[^>]*>/i.test(source.index)
    || /data-track-kind="captions"/i.test(source.index)
    || /data-composition-id="captions"/i.test(source.index);
  assert.ok(hasMountedCaptions, 'captions must be mounted in the master composition');

  const inspected = Object.entries(source);
  for (const [name, html] of inspected) {
    assert.doesNotMatch(html, /(?:src|href)="(?:https?:)?\/\//i, `${name} must not fetch network resources at runtime`);
    assert.doesNotMatch(html, /@import\s+(?:url\()?['"]?(?:https?:)?\/\//i, `${name} must not import network CSS at runtime`);
  }
  assert.match(source.index, /<script src="assets\/vendor\/gsap\.min\.js"><\/script>/, 'GSAP must be vendored locally');

  const references = [];
  for (const [name, html] of inspected) {
    for (const match of html.matchAll(/(?:src|href|data-composition-src)="([^"]+)"/g)) {
      const path = match[1];
      if (/^(?:data:|#)/.test(path)) continue;
      references.push({ owner: files[name], path });
    }
  }
  for (const { owner, path } of references) {
    const candidates = [join(project, path), join(project, dirname(owner), path)];
    let found;
    for (const candidate of candidates) {
      try {
        const info = await stat(candidate);
        if (info.isFile() && info.size > 0) { found = candidate; break; }
      } catch {}
    }
    assert.ok(found, `${owner} references missing or empty local asset ${path}`);
  }
});
