import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Curriculum data is authored JSON under curriculum/*.json — one file per
// board+stage+subject tree. Units mirror scheme-of-work groupings; topics are
// the generation unit (one focused video per topic); objectives carry the
// official framework codes and wording for scope control.
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);
const code = z.string().regex(/^[0-9A-Z][0-9A-Za-z]{0,6}\.\d{2}$/);
const text = max => z.string().trim().min(1).max(max);
export const FAIR_VISUAL_KINDS = ['place-value', 'equation', 'comparison', 'number-line', 'steps', 'recap', 'fraction-bars', 'bar-model', 'area-grid', 'angle', 'coordinate-grid', 'chart', 'clock', 'base-ten'];

export const fairObjectiveSchema = z.object({ code, text: text(600) }).strict();
export const fairTopicSchema = z.object({
  id: slug, title: text(120), summary: z.string().trim().min(10).max(600),
  objectives: z.array(fairObjectiveSchema).min(1).max(6),
  prerequisites: z.array(slug).max(8).default([]),
  scope: z.string().trim().min(10).max(900),
  restrictions: z.array(z.string().trim().min(3).max(300)).max(8).default([]),
  targetSeconds: z.number().int().min(120).max(480).default(300),
  suggestedVisuals: z.array(z.enum(FAIR_VISUAL_KINDS)).max(8).default([]),
}).strict();
export const fairUnitSchema = z.object({ id: slug, strand: text(120), title: text(120), topics: z.array(fairTopicSchema).min(1).max(30) }).strict();
export const fairCurriculumSchema = z.object({
  board: text(60), framework: text(20), frameworkVersion: text(60).optional(),
  stage: text(12), subject: text(60), title: text(160), audience: text(200), language: z.string().trim().min(2).max(12).default('en'),
  sources: z.array(z.object({ title: text(160), url: z.string().url().max(2000), note: text(300).optional() }).strict()).min(1).max(12),
  units: z.array(fairUnitSchema).min(1).max(60),
}).strict();

export function fairCurriculumDir(env = process.env) {
  return env.FAIR_CURRICULUM_DIR || fileURLToPath(new URL('../curriculum/', import.meta.url));
}

export async function fairLoadCurricula(env = process.env) {
  const directory = fairCurriculumDir(env);
  let names;
  try { names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort(); }
  catch { throw new Error(`Curriculum directory is missing: ${directory}. Author a curriculum tree JSON first.`); }
  const trees = [];
  for (const name of names) {
    let raw;
    try { raw = JSON.parse(await readFile(join(directory, name), 'utf8')); }
    catch (error) { throw new Error(`Curriculum file ${name} is not valid JSON: ${error.message}`); }
    const parsed = fairCurriculumSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Curriculum file ${name} failed validation: ${parsed.error.issues.slice(0, 5).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    const tree = parsed.data;
    const ids = tree.units.flatMap(unit => [unit.id, ...unit.topics.map(topic => topic.id)]);
    if (new Set(ids).size !== ids.length) throw new Error(`Curriculum file ${name} repeats a unit or topic id.`);
    const topicIds = new Set(tree.units.flatMap(unit => unit.topics.map(topic => topic.id)));
    for (const unit of tree.units) for (const topic of unit.topics) {
      for (const prerequisite of topic.prerequisites) if (!topicIds.has(prerequisite)) throw new Error(`Curriculum file ${name}: topic ${topic.id} lists unknown prerequisite ${prerequisite}.`);
    }
    trees.push({ file: name, ...tree });
  }
  return trees;
}

export function fairCurriculumIndex(trees) {
  return trees.flatMap(tree => tree.units.flatMap(unit => unit.topics.map(topic => ({
    board: tree.board, framework: tree.framework, stage: tree.stage, subject: tree.subject, title: tree.title,
    unitId: unit.id, unitTitle: unit.title, strand: unit.strand,
    topicId: topic.id, topicTitle: topic.title, summary: topic.summary, objectiveCodes: topic.objectives.map(objective => objective.code),
    prerequisites: topic.prerequisites, targetSeconds: topic.targetSeconds,
  }))));
}

export function fairFindTopic(trees, topicId) {
  for (const tree of trees) for (const unit of tree.units) {
    const topic = unit.topics.find(item => item.id === topicId);
    if (topic) return { tree, unit, topic };
  }
  return null;
}

// Compiles a curriculum topic into the untrusted-text brief the planner already
// understands. Objectives, scope and restrictions are quoted verbatim so scope
// control stays in authored data, not in model judgement.
export function fairTopicBrief({ tree, unit, topic }, overrides = {}) {
  const objectives = topic.objectives.map(objective => `${objective.code} ${objective.text}`).join(' ');
  const restrictions = topic.restrictions.length ? ` Restrictions: ${topic.restrictions.join(' ')}` : '';
  const prerequisiteNote = topic.prerequisites.length ? ` Learners have already covered prerequisite topics: ${topic.prerequisites.join(', ')}.` : '';
  const visuals = topic.suggestedVisuals.length ? ` Suitable renderer visual kinds include: ${topic.suggestedVisuals.join(', ')}.` : '';
  return {
    generationVersion: 'quality',
    text: `${tree.title} — ${unit.title} — ${topic.title}. ${topic.summary} Learning objectives to cover: ${objectives} Scope: ${topic.scope}${restrictions}${prerequisiteNote}${visuals}`,
    audience: tree.audience,
    curriculumSource: tree.sources.map(source => source.url).join(' '),
    targetSeconds: topic.targetSeconds,
    topic: {
      board: tree.board, stage: tree.stage, subject: tree.subject,
      unitId: unit.id, topicId: topic.id, title: topic.title,
      objectiveCodes: topic.objectives.map(objective => objective.code),
    },
    ...overrides,
  };
}

// Joins job state onto the curriculum index so the browser and CLI can show
// which topics have drafts, are running, or are educator-approved.
export function fairCurriculumCoverage(index, jobs) {
  const byTopic = new Map();
  for (const job of jobs) {
    const topicId = job.brief?.topic?.topicId;
    if (!topicId) continue;
    const entries = byTopic.get(topicId) || [];
    entries.push({ jobId: job.id, status: job.status, review: job.review?.decision || null, createdAt: job.createdAt, mp4: job.result?.mp4 || null });
    byTopic.set(topicId, entries);
  }
  return index.map(entry => ({ ...entry, jobs: (byTopic.get(entry.topicId) || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) }));
}
