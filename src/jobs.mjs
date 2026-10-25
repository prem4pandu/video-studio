import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeBrief } from './plan.mjs';
import { fairRunPipeline } from './pipeline.mjs';
import { fairReadJson, fairWriteJson } from './utils.mjs';

export const FAIR_ARTIFACTS = { video: 'lesson.mp4', captions: 'captions.vtt', transcript: 'transcript.txt', lesson: 'lesson.json', prompts: 'prompts.json', composition: 'index.html', report: 'quality-report.json', manifest: 'manifest.json' };
export function fairJobArtifacts(brief) {
  return brief?.generationVersion === 'open-source'
    ? { ...FAIR_ARTIFACTS, composition: 'manim-scene.py', renderPlan: 'fair-render-plan.json', footage: 'wan-provenance.json' }
    : FAIR_ARTIFACTS;
}
export const fairJobId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

export class FairJobStore {
  constructor(root, { run = fairRunPipeline, env = process.env, maxQueue = 500 } = {}) {
    this.root = root; this.run = run; this.env = env; this.maxQueue = maxQueue;
    this.jobs = new Map(); this.queue = []; this.active = null; this.writes = new Map();
  }
  directory(id) { if (!fairJobId(id)) throw new Error('Invalid job ID.'); return join(this.root, id); }
  async init() {
    await mkdir(this.root, { recursive: true });
    for (const id of await readdir(this.root)) {
      if (!fairJobId(id)) continue;
      try {
        const job = await fairReadJson(join(this.directory(id), 'job.json'));
        if (job.id !== id || !['queued', 'running', 'completed', 'failed', 'interrupted'].includes(job.status)) continue;
        normalizeBrief(job.brief);
        this.jobs.set(id, job);
        if (['queued', 'running'].includes(job.status)) await this.update(job, { status: 'interrupted', message: 'Generation was interrupted. Retry to resume verified artifacts.', error: 'The studio stopped before this job finished.' });
      } catch (error) { console.error(`Could not recover job ${id}: ${error.message}`); }
    }
  }
  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(job => ({ ...job, lesson: undefined, events: undefined })); }
  get(id) { return fairJobId(id) ? this.jobs.get(id) : undefined; }
  async save(job) {
    const snapshot = structuredClone(job);
    const prior = this.writes.get(job.id) || Promise.resolve();
    const write = prior.catch(() => {}).then(() => fairWriteJson(join(this.directory(job.id), 'job.json'), snapshot));
    this.writes.set(job.id, write);
    await write;
  }
  async update(job, patch) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    if (patch.message) job.events = [...(job.events || []), { at: job.updatedAt, stage: job.stage, message: patch.message }].slice(-100);
    await this.save(job);
  }
  async create(input) {
    if (this.queue.length >= this.maxQueue) throw Object.assign(new Error('The queue is full. Wait for a lesson to finish before adding more.'), { statusCode: 429 });
    const brief = normalizeBrief({ ...input, generationVersion: input.generationVersion ?? 'quality' }), now = new Date().toISOString();
    const job = { id: randomUUID(), brief, status: 'queued', stage: 'plan', progress: 0, message: 'Waiting to generate.', createdAt: now, updatedAt: now, events: [], attempts: 0 };
    this.jobs.set(job.id, job);
    await this.save(job);
    this.queue.push(job.id); this.pump();
    return job;
  }
  async retry(id) {
    const job = this.get(id);
    if (!job) throw Object.assign(new Error('Lesson not found.'), { statusCode: 404 });
    if (!['failed', 'interrupted'].includes(job.status)) throw Object.assign(new Error('Only failed or interrupted jobs can be retried.'), { statusCode: 409 });
    if (this.active?.id === id) throw Object.assign(new Error('The previous process is still stopping. Try again shortly.'), { statusCode: 409 });
    await this.update(job, { status: 'queued', error: null, message: 'Queued to resume verified stages.' });
    this.queue.push(id); this.pump(); return job;
  }
  // Educator review gate: a rendered draft is recorded approved/rejected/needs-changes.
  // The MP4 and provenance artifacts stay immutable; review state is metadata.
  async review(id, { decision, note, reviewer } = {}) {
    const job = this.get(id);
    if (!job) throw Object.assign(new Error('Lesson not found.'), { statusCode: 404 });
    if (job.status !== 'completed') throw Object.assign(new Error('Only a completed lesson can be reviewed.'), { statusCode: 409 });
    if (!['approved', 'rejected', 'needs-changes'].includes(decision)) throw Object.assign(new Error('Review decision must be approved, rejected or needs-changes.'), { statusCode: 400 });
    const record = { decision, note: String(note || '').slice(0, 2000), reviewer: String(reviewer || 'educator').slice(0, 80), at: new Date().toISOString() };
    await fairWriteJson(join(this.directory(id), 'review.json'), record);
    await this.update(job, { review: record });
    return job;
  }
  async cancel(id) {
    const job = this.get(id);
    if (!job) throw Object.assign(new Error('Lesson not found.'), { statusCode: 404 });
    if (!['queued', 'running'].includes(job.status)) throw Object.assign(new Error('This lesson is not generating.'), { statusCode: 409 });
    this.queue = this.queue.filter(value => value !== id);
    if (this.active?.id === id) this.active.controller.abort(new Error('Generation cancelled.'));
    await this.update(job, { status: 'interrupted', message: job.brief.generationVersion === 'open-source'
      ? 'Lesson generation stopped. An already-running Wan task may finish on ComfyUI; retry reuses its saved request.'
      : 'Generation cancelled. Saved stages can be resumed.', error: null });
    return job;
  }
  pump() {
    if (this.active || !this.queue.length) return;
    const id = this.queue.shift(), job = this.jobs.get(id), controller = new AbortController();
    this.active = { id, controller };
    this.execute(job, controller).finally(() => { this.active = null; this.pump(); }).catch(error => console.error('Job persistence failed:', error.message));
  }
  async execute(job, controller) {
    try {
      await this.update(job, { status: 'running', attempts: job.attempts + 1, message: 'Planning your lesson.' });
      const result = await this.run(job.brief, this.directory(job.id), { signal: controller.signal, env: this.env,
        onProgress: patch => controller.signal.aborted ? Promise.resolve() : this.update(job, patch) });
      if (controller.signal.aborted) return;
      await this.update(job, { status: 'completed', stage: 'verify', progress: 100, message: 'Your video is ready for teaching review.', lesson: result.lesson, report: result.report,
        artifacts: Object.fromEntries(Object.keys(fairJobArtifacts(job.brief)).map(kind => [kind, `/api/jobs/${job.id}/artifacts/${kind}`])) });
    } catch (error) {
      if (!controller.signal.aborted) await this.update(job, { status: 'failed', error: String(error?.message || error).slice(0, 5000), message: 'Generation stopped. The error below explains what needs attention.' });
    }
  }
  async stop() { this.queue = []; this.active?.controller.abort(new Error('Studio stopping.')); await Promise.allSettled(this.writes.values()); }
}
