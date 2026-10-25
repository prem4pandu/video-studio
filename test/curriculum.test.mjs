import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fairCurriculumCoverage, fairCurriculumIndex, fairFindTopic, fairLoadCurricula, fairTopicBrief } from '../src/curriculum.mjs';
import { normalizeBrief } from '../src/plan.mjs';

const tree = () => JSON.parse(JSON.stringify({
  board: 'cambridge-primary', framework: '0096', stage: '5', subject: 'mathematics',
  title: 'Cambridge Primary Mathematics Stage 5', audience: 'Stage 5 learners',
  sources: [{ title: 'Framework', url: 'https://example.test/framework.pdf' }],
  units: [{ id: 'u-one', strand: 'Number', title: 'Unit one', topics: [
    { id: 't-alpha', title: 'Alpha', summary: 'First topic summary here.', scope: 'Within first topic scope only.',
      objectives: [{ code: '5Np.01', text: 'Understand decimal digit value.' }] },
    { id: 't-beta', title: 'Beta', summary: 'Second topic summary here.', scope: 'Within second topic scope only.',
      objectives: [{ code: '5Np.02', text: 'Multiply by powers of ten.' }], prerequisites: ['t-alpha'] },
  ] }],
}));

test('the shipped Stage 5 tree loads and covers every objective code once', async () => {
  const trees = await fairLoadCurricula();
  const shipped = trees.find(item => item.file === 'cambridge-primary-maths-stage5.json');
  assert.ok(shipped, 'the Stage 5 tree must exist');
  assert.equal(shipped.stage, '5');
  const index = fairCurriculumIndex([shipped]);
  assert.equal(index.length, 49);
  const codes = new Set(index.flatMap(item => item.objectiveCodes));
  assert.equal(codes.size, 51);
  for (const prefix of ['5Nc.0', '5Ni.0', '5Np.0', '5Nf.', '5Gt.0', '5Gg.0', '5Gp.0', '5Ss.0', '5Sp.0']) {
    assert.ok([...codes].some(code => code.startsWith(prefix)), `missing ${prefix}* objectives`);
  }
});

test('topic compilation produces a scoped, reviewable brief', async () => {
  const trees = await fairLoadCurricula();
  const found = fairFindTopic(trees, 's5-pv-rounding');
  assert.ok(found);
  const brief = normalizeBrief(fairTopicBrief(found, { voiceProvider: 'qwentts' }));
  assert.equal(brief.topic.topicId, 's5-pv-rounding');
  assert.equal(brief.topic.board, 'cambridge-primary');
  assert.deepEqual(brief.topic.objectiveCodes, ['5Np.05']);
  assert.match(brief.text, /5Np\.05/);
  assert.match(brief.text, /Scope:/);
  assert.match(brief.curriculumSource, /cambridgeinternational\.org/);
  assert.equal(brief.targetSeconds, 260);
});

test('loader rejects malformed trees and unknown prerequisites', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'fair-curriculum-'));
  t.after(async () => { const { rm } = await import('node:fs/promises'); await rm(dir, { recursive: true, force: true }); });
  const bad = tree();
  bad.units[0].topics[1].prerequisites = ['does-not-exist'];
  await writeFile(join(dir, 'bad.json'), JSON.stringify(bad));
  await assert.rejects(fairLoadCurricula({ FAIR_CURRICULUM_DIR: dir }), /unknown prerequisite/);
  await writeFile(join(dir, 'bad.json'), JSON.stringify({ board: 'x' }));
  await assert.rejects(fairLoadCurricula({ FAIR_CURRICULUM_DIR: dir }), /failed validation/);
});

test('coverage joins job state onto topics', async () => {
  const trees = await fairLoadCurricula();
  const index = fairCurriculumIndex(trees);
  const jobs = [
    { id: 'a', brief: { topic: { topicId: 's5-pv-rounding' } }, status: 'completed', review: { decision: 'approved' }, createdAt: '2026-01-02T00:00:00Z' },
    { id: 'b', brief: { topic: { topicId: 's5-pv-rounding' } }, status: 'failed', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'c', brief: { text: 'unrelated' }, status: 'completed', createdAt: '2026-01-03T00:00:00Z' },
  ];
  const coverage = fairCurriculumCoverage(index, jobs);
  const rounding = coverage.find(item => item.topicId === 's5-pv-rounding');
  assert.equal(rounding.jobs.length, 2);
  assert.equal(rounding.jobs[0].jobId, 'a');
  assert.equal(rounding.jobs[0].review, 'approved');
  assert.equal(coverage.find(item => item.topicId === 's5-sp-likelihood').jobs.length, 0);
});
