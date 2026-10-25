import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const choice = z.object({ id: z.string().min(1), text: z.string().min(1), feedback: z.string().min(1), misconception: z.string().min(1).nullable() }).strict();
const check = z.object({
  id: z.string().min(1), phase: z.enum(['readiness', 'practice', 'transfer', 'recall']), prompt: z.string().min(1),
  choices: z.array(choice).min(2).max(5), correctChoiceId: z.string().min(1), successMessage: z.string().min(1),
  repairStepId: z.string().min(1).nullable(), explanationPrompt: z.string().min(1),
}).strict();
const model = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hundred-square'), shadedTenths: z.number().int().min(0).max(10), shadedHundredths: z.number().int().min(0).max(9), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('fraction-bars'), label: z.string().min(1), bars: z.array(z.object({ numerator: z.number().int().min(0).max(12), denominator: z.number().int().min(1).max(12), label: z.string().min(1) }).strict()).min(1).max(3) }).strict(),
]);
const step = z.object({
  id: z.string().min(1), phase: z.enum(['repair', 'explain', 'guided', 'recap']), eyebrow: z.string().min(1),
  title: z.string().min(1), body: z.string().min(1), model,
}).strict();

export const fairLearningSessionSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), ageRange: z.tuple([z.number().int(), z.number().int()]),
  objective: z.string().min(1), successEvidence: z.string().min(1), estimatedMinutes: z.number().positive(),
  steps: z.array(step).min(4), checks: z.array(check).min(4), recallDelayHours: z.number().int().positive(),
  review: z.object({ educatorApproved: z.boolean(), childTested: z.boolean(), status: z.string().min(1) }).strict(),
}).strict().superRefine((session, context) => {
  const ids = new Set();
  for (const item of [...session.steps, ...session.checks]) {
    if (ids.has(item.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate session id: ${item.id}` });
    ids.add(item.id);
  }
  for (const item of session.checks) {
    const choiceIds = new Set(item.choices.map(option => option.id));
    if (choiceIds.size !== item.choices.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['checks', item.id], message: 'Choice ids must be unique.' });
    if (!choiceIds.has(item.correctChoiceId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['checks', item.id], message: 'Correct choice is missing.' });
    if (item.repairStepId && !session.steps.some(itemStep => itemStep.id === item.repairStepId && itemStep.phase === 'repair')) context.addIssue({ code: z.ZodIssueCode.custom, path: ['checks', item.id], message: 'Repair step is missing.' });
  }
  for (const [index, item] of session.steps.entries()) if (item.model.kind === 'fraction-bars') {
    for (const bar of item.model.bars) if (bar.numerator > bar.denominator) context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'model', 'bars'], message: 'Fraction-bar numerator cannot exceed its denominator.' });
  }
});

const demoFiles = { 'decimal-place-value': 'decimal-learning-session.json', 'equivalent-fractions': 'fraction-learning-session.json' };
export async function fairLoadDemoLearningSession(id = 'decimal-place-value') {
  const filename = demoFiles[id];
  if (!filename) throw Object.assign(new Error(`Unknown demo learning session: ${id}`), { statusCode: 404 });
  const raw = JSON.parse(await readFile(resolve(appDir, 'content', filename), 'utf8'));
  return fairLearningSessionSchema.parse(raw);
}

export function fairEvaluateResponse(session, checkId, choiceId) {
  const parsed = fairLearningSessionSchema.parse(session);
  const item = parsed.checks.find(candidate => candidate.id === checkId);
  if (!item) throw new Error(`Unknown check: ${checkId}`);
  const selected = item.choices.find(candidate => candidate.id === choiceId);
  if (!selected) throw new Error(`Unknown choice for ${checkId}: ${choiceId}`);
  const correct = selected.id === item.correctChoiceId;
  return {
    correct,
    feedback: correct ? item.successMessage : selected.feedback,
    misconception: correct ? null : selected.misconception,
    nextStepId: correct ? null : item.repairStepId,
  };
}

export function fairRecallDueAt(completedAt, delayHours) {
  const date = new Date(completedAt);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(delayHours) || delayHours < 1) throw new Error('A valid completion time and positive whole-hour delay are required.');
  return new Date(date.getTime() + delayHours * 3_600_000).toISOString();
}
