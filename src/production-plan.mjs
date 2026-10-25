import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const text = max => z.string().trim().min(1).max(max);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const FAIR_RENDER_ROUTES = ['deterministic', 'wan', 'ltx', 'kandinsky'];

const route = z.enum(FAIR_RENDER_ROUTES);
const dialogueSchema = z.object({ speaker: id, text: text(1000) }).strict();
const overlaySchema = z.object({
  id,
  kind: z.enum(['equation', 'diagram', 'label', 'caption', 'question', 'highlight']),
  source: text(240),
  startPhrase: text(160).optional(),
  endPhrase: text(160).optional(),
}).strict();
const continuitySchema = z.object({
  costume: text(120).optional(),
  screenDirection: z.enum(['left-to-right', 'right-to-left', 'neutral']).default('neutral'),
  previousShotId: id.optional(),
}).strict();
const provenanceSchema = z.object({
  model: text(160),
  checkpoint: text(240),
  license: text(120),
  seed: z.number().int().nonnegative(),
  referenceHashes: z.record(sha256).default({}),
}).strict();

export const fairProductionShotSchema = z.object({
  id,
  sceneId: id,
  purpose: text(300),
  route,
  fallbackRoute: route.optional(),
  startSeconds: z.number().finite().nonnegative(),
  durationSeconds: z.number().finite().positive().max(30),
  characters: z.array(id).max(8).default([]),
  location: id,
  action: text(500),
  camera: z.object({
    shotSize: z.enum(['establishing', 'wide', 'medium', 'close-up', 'insert']),
    movement: z.enum(['static', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'track']),
  }).strict(),
  dialogue: dialogueSchema.optional(),
  overlays: z.array(overlaySchema).max(12).default([]),
  references: z.array(text(300)).max(20).default([]),
  continuity: continuitySchema.default({ screenDirection: 'neutral' }),
  provenance: provenanceSchema.optional(),
}).strict().superRefine((shot, context) => {
  if (shot.dialogue && !shot.characters.includes(shot.dialogue.speaker)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dialogue', 'speaker'], message: 'Dialogue speaker must be present in the shot characters.' });
  }
  if (shot.route !== 'deterministic' && shot.characters.length && !shot.references.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['references'], message: 'Generative character shots require at least one approved reference.' });
  }
  if (shot.fallbackRoute === shot.route) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fallbackRoute'], message: 'Fallback route must differ from the primary route.' });
  }
  if (shot.route !== 'deterministic' && !shot.fallbackRoute) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fallbackRoute'], message: 'Generative shots require a fallback route.' });
  }
});

export const fairProductionPlanSchema = z.object({
  revision: z.literal(1),
  id,
  title: text(120),
  width: z.number().int().min(640).max(7680),
  height: z.number().int().min(360).max(4320),
  fps: z.number().int().min(12).max(60),
  durationSeconds: z.number().finite().positive().max(600),
  shots: z.array(fairProductionShotSchema).min(1).max(120),
}).strict();

export function validateProductionPlan(raw) {
  const plan = fairProductionPlanSchema.parse(raw);
  const issues = [], ids = new Set();
  let previousEnd = 0;
  for (const shot of plan.shots) {
    if (ids.has(shot.id)) issues.push(`Duplicate shot ID: ${shot.id}`);
    ids.add(shot.id);
    if (shot.startSeconds < previousEnd) issues.push(`Shot ${shot.id} overlaps the previous shot.`);
    const end = shot.startSeconds + shot.durationSeconds;
    if (end > plan.durationSeconds) issues.push(`Shot ${shot.id} ends after the production plan.`);
    if (shot.continuity.previousShotId && !ids.has(shot.continuity.previousShotId)) issues.push(`Shot ${shot.id} references an unknown or later continuity shot: ${shot.continuity.previousShotId}`);
    previousEnd = end;
  }
  if (issues.length) throw new Error(`Invalid production plan: ${issues.join(' ')}`);
  return plan;
}
