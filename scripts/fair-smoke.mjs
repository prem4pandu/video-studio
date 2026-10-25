import { resolve, join } from 'node:path';
import { FairJobStore, fairJobId } from '../src/fair-jobs.mjs';
import { fairRunPipeline, fairRenderLesson } from '../src/fair-pipeline.mjs';
import { fairWriteJson } from '../src/fair-utils.mjs';
import { access, cp, readFile } from 'node:fs/promises';

const flags = {};
for (let at = 2; at < process.argv.length; at += 2) {
  const name = process.argv[at], value = process.argv[at + 1];
  if (!['--resume', '--rerender', '--voice', '--seconds', '--footage'].includes(name) || !value) throw new Error('Usage: npm run test:pipeline -- [--resume JOB_ID | --rerender JOB_ID] [--voice qwentts|piper|kokoro] [--seconds 90] [--footage none|wan]');
  flags[name] = value;
}
for (const name of ['--resume', '--rerender']) if (flags[name] && !fairJobId(flags[name])) throw new Error('Invalid smoke-test job ID.');
if (flags['--resume'] && flags['--rerender']) throw new Error('Choose resume or rerender, not both.');
if (flags['--resume'] && Object.keys(flags).length > 1) throw new Error('Resume retains the saved settings; use --rerender to change rendering options.');
const root = resolve('.fair-video/smoke');
const env = { ...process.env, FAIR_OPEN_REVIEW_MODEL: process.env.FAIR_OPEN_REVIEW_MODEL || 'qwen3:30b',
  FAIR_ALIGNMENT_MODEL_DIR: process.env.FAIR_ALIGNMENT_MODEL_DIR || resolve('.fair-neural/qwen-aligner-8bit') };
try { await access(join(env.FAIR_ALIGNMENT_MODEL_DIR, 'model.safetensors')); }
catch { throw new Error('Install the local word aligner first: .fair-neural/qwen-venv/bin/python scripts/fair-setup-alignment.py'); }
const started = performance.now(), stages = [], controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('Smoke test cancelled.')));
let parent;
const store = new FairJobStore(root, { env, run: async (brief, directory, options) => {
  const runtime = {
  ...options, signal: controller.signal,
  onProgress: async event => {
    const seconds = (performance.now() - started) / 1000;
    stages.push({ seconds, stage: event.stage, message: event.message });
    console.log(`[${seconds.toFixed(1)}s] ${event.progress ?? 0}% ${event.message}`);
    await options.onProgress(event);
  },
  };
  if (!parent) return fairRunPipeline(brief, directory, runtime);
  const source = store.directory(parent.id);
  await cp(join(source, 'project/audio'), join(directory, 'project/audio'), { recursive: true });
  await cp(join(source, 'generation'), join(directory, 'generation'), { recursive: true });
  await fairWriteJson(join(directory, 'render-parent.json'), { jobId: parent.id, videoSha256: parent.report.video.sha256,
    reason: 'Render revision of the same reviewed lesson; original export is preserved.' });
  const lesson = JSON.parse(await readFile(join(source, 'project/lesson.json'), 'utf8'));
  return fairRenderLesson(lesson, brief, directory, runtime);
} });
await store.init();
if (flags['--rerender']) {
  parent = store.get(flags['--rerender']);
  if (parent?.status !== 'completed') throw new Error('Rerender requires a completed smoke-test job.');
}
const job = flags['--resume'] ? await store.retry(flags['--resume']) : await store.create({
  text: 'Teach place value.',
  generationVersion: 'open-source', provider: 'local', avatar: 'none',
  model: env.FAIR_OPEN_MODEL || env.FAIR_MODEL || 'gpt-oss:20b', voiceProvider: flags['--voice'] || 'qwentts',
  footage: flags['--footage'] || 'none', targetSeconds: Number(flags['--seconds'] || 90),
  ...(parent ? parent.brief : {}),
  ...(flags['--voice'] ? { voiceProvider: flags['--voice'] } : {}),
  ...(flags['--footage'] ? { footage: flags['--footage'] } : {}),
  ...(flags['--seconds'] ? { targetSeconds: Number(flags['--seconds']) } : {}),
});
console.log(`Smoke job: ${job.id}\nArtifacts: ${join(store.directory(job.id), 'project')}`);
while (store.active || store.queue.length) await new Promise(resolve => setTimeout(resolve, 500));
const result = store.get(job.id);
const summary = { jobId: job.id, status: result.status, elapsedSeconds: (performance.now() - started) / 1000,
  brief: result.brief, criticModel: env.FAIR_OPEN_REVIEW_MODEL, error: result.error || null, stages, report: result.report || null };
await fairWriteJson(join(store.directory(job.id), 'smoke-report.json'), summary);
await fairWriteJson(join(store.directory(job.id), `smoke-report-attempt-${result.attempts}.json`), summary);
console.log(JSON.stringify({ jobId: job.id, status: result.status, elapsedSeconds: summary.elapsedSeconds, error: summary.error, report: summary.report }, null, 2));
if (result.status !== 'completed') process.exitCode = 1;
