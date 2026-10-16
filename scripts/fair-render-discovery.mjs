import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { FairJobStore } from '../src/fair-jobs.mjs';
import { fairRenderLesson } from '../src/fair-pipeline.mjs';

// An explicit authored benchmark, never a replacement for failed generation.
const lesson = JSON.parse(await readFile(new URL('../examples/fair-place-value-discovery.json', import.meta.url)));
const brief = JSON.parse(await readFile(new URL('../examples/fair-place-value-discovery-brief.json', import.meta.url)));
// Every invocation gets private job storage; never recover or mutate app jobs.
await mkdir('.fair-video-discovery', { recursive: true });
const root = await mkdtemp('.fair-video-discovery/run-');
const store = new FairJobStore(root, {
  run: async (input, directory, options) => {
    await cp(new URL('../examples/fair-place-value-discovery-provenance.json', import.meta.url), `${directory}/authored-provenance.json`);
    return fairRenderLesson(lesson, input, directory, {
      ...options, origin: 'authored', onProgress: async event => {
        console.log(`${event.progress}% ${event.message}`);
        await options.onProgress(event);
      },
    });
  },
});
await store.init();
const job = await store.create(brief);
console.log(`Authored discovery benchmark: ${job.id}`);
console.log(`Artifacts: ${store.directory(job.id)}/project`);
while (store.active || store.queue.length) await new Promise(resolve => setTimeout(resolve, 500));
const result = store.get(job.id);
console.log(JSON.stringify({ id: job.id, status: result.status, error: result.error, report: result.report }, null, 2));
if (result.status !== 'completed') process.exitCode = 1;
