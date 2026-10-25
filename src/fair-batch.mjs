#!/usr/bin/env node
// Batch-generate lesson videos for curriculum topics, sequentially and
// resumably through the shared job store, so the review UI sees every draft.
//
//   node src/fair-batch.mjs --coverage                 report per-topic status
//   node src/fair-batch.mjs --topic s5-pv-rounding     one topic
//   node src/fair-batch.mjs --unit s5-place-value      a whole unit
//   node src/fair-batch.mjs --all                      the whole tree
//   extra flags: --voice piper --model gemma3:12b --seconds 300 --version classic
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FairJobStore } from './fair-jobs.mjs';
import { fairCurriculumCoverage, fairCurriculumIndex, fairFindTopic, fairLoadCurricula, fairTopicBrief } from './fair-curriculum.mjs';
import { fairHash } from './fair-utils.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };

if (flag('help') || flag('h') || !args.length) {
  console.log(`Video Studio batch generation\n\n  --coverage                 report generation/review status per topic\n  --topic <id>               generate one topic\n  --unit <id>                paused pending single-lesson review\n  --all                      paused pending single-lesson review\n  --status                   show the job queue\n  --voice <provider>         qwentts (default), piper, kokoro, say\n  --model <name>             planning model override\n  --seconds <n>              target duration override\n  --version <name>           quality (default), classic or open-source\n  --only-pending             skip topics that already have a completed job`);
  process.exit(0);
}

const env = process.env;
if (flag('all') || option('unit', null)) {
  console.error('Bulk generation is paused. Use --topic for one lesson and review its teaching film first.');
  process.exit(1);
}
const root = resolve(env.FAIR_DATA_DIR || join(fileURLToPath(new URL('..', import.meta.url)), '.fair-video'));
await mkdir(root, { recursive: true });
const store = new FairJobStore(root, { env });
await store.init();
const trees = await fairLoadCurricula(env);
const index = fairCurriculumIndex(trees);
const coverage = fairCurriculumCoverage(index, store.list());
const byTopic = new Map(coverage.map(item => [item.topicId, item]));

if (flag('coverage')) {
  let done = 0, approved = 0;
  for (const item of coverage) {
    const latest = item.jobs[0];
    const state = latest ? `${latest.status}${latest.review ? ` · ${latest.review}` : ''}` : 'not started';
    if (latest?.status === 'completed') done += 1;
    if (latest?.review === 'approved') approved += 1;
    console.log(`${state.padEnd(22)} ${item.topicId.padEnd(28)} ${item.topicTitle}`);
  }
  console.log(`\n${coverage.length} topics · ${done} with a completed draft · ${approved} approved`);
  process.exit(0);
}

if (flag('status')) {
  const jobs = store.list().slice(0, 30);
  for (const job of jobs) console.log(`${job.status.padEnd(12)} ${(job.brief?.topic?.topicId || job.id).padEnd(28)} ${job.message || ''}`.slice(0, 140));
  console.log(`\n${store.list().length} jobs total, ${store.queue.length} queued, active: ${store.active?.id || 'none'}`);
  process.exit(0);
}

let topicIds = [];
if (flag('all')) topicIds = index.map(item => item.topicId);
else if (option('unit', null)) topicIds = index.filter(item => item.unitId === option('unit')).map(item => item.topicId);
else if (option('topic', null)) topicIds = [option('topic')];
if (!topicIds.length) { console.error('Choose --topic. See --help.'); process.exit(1); }

const overrides = {};
for (const [key, arg] of [['provider', 'provider'], ['model', 'model'], ['voiceProvider', 'voice'], ['generationVersion', 'version'], ['avatar', 'avatar']]) {
  const value = option(arg, null); if (value) overrides[key] = value;
}
if (option('seconds', null)) overrides.targetSeconds = Number(option('seconds'));

const jobs = [];
for (const topicId of topicIds) {
  const found = fairFindTopic(trees, topicId);
  if (!found) { console.error(`Unknown topic: ${topicId}`); continue; }
  const existing = byTopic.get(topicId)?.jobs || [];
  if (flag('only-pending') && existing.some(job => job.status === 'completed')) { console.log(`Skipping ${topicId}: a completed draft already exists.`); continue; }
  const job = await store.create(fairTopicBrief(found, overrides));
  jobs.push(job);
  console.log(`Queued ${topicId} → job ${job.id}`);
}
if (!jobs.length) { console.log('Nothing to do.'); process.exit(0); }
console.log(`\nGenerating ${jobs.length} topic(s) sequentially. Review drafts at the studio UI when done.\n`);

// Wait until the queue drains; the job store persists progress to disk.
const wanted = new Set(jobs.map(job => job.id));
let lastLine = '';
await new Promise(resolvePromise => {
  const timer = setInterval(() => {
    const states = jobs.map(job => store.get(job.id));
    const pending = states.filter(job => ['queued', 'running'].includes(job.status));
    const line = states.map(job => `${job.brief.topic.topicId}: ${job.status}`).join(' · ');
    if (line !== lastLine) { console.log(line); lastLine = line; }
    if (!pending.length) { clearInterval(timer); resolvePromise(); }
  }, 2000);
  process.on('SIGINT', () => { store.stop().then(() => process.exit(130)); });
});

const states = jobs.map(job => store.get(job.id));
const ok = states.filter(job => job.status === 'completed');
for (const job of states) {
  const mp4 = job.artifacts?.video ? `${root}/${job.id}/project/lesson.mp4` : '';
  console.log(`${job.status.padEnd(12)} ${job.brief.topic.topicId.padEnd(28)} ${mp4 || job.error || ''}`);
}
console.log(`\n${ok.length}/${states.length} completed. Every video is a draft until educator review. Batch digest: ${fairHash(wanted.size ? [...wanted].sort() : []).slice(0, 12)}`);
await store.stop();
process.exit(states.some(job => job.status === 'failed') ? 1 : 0);
