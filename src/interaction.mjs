// Phase A interaction nodes.
//
// A question scene can carry a small multiple-choice interaction. The same node
// is rendered twice: as cards plus a countdown ring inside the video, and (later)
// as clickable cards in the interactive player. Deriving it here, from the
// lesson content, means the authored benchmark and the generated lessons get
// interactivity without hand-writing UI per lesson.

const FRACTION = /^(\d{1,2})\/(\d{1,2})$/;
const LETTERS = 'ABCD';

export function fairFractionParts(value) {
  const match = String(value ?? '').match(FRACTION);
  return match ? { numerator: Number(match[1]), denominator: Number(match[2]) } : null;
}

function equivalentToAny(value, candidates) {
  const parts = fairFractionParts(value);
  if (!parts) return false;
  return candidates.some(candidate => {
    const other = fairFractionParts(candidate);
    return other ? parts.numerator * other.denominator === other.numerator * parts.denominator : false;
  });
}

function normalize(explicit, scene) {
  const options = (explicit.options ?? []).map(option => ({ ...option, label: String(option.label).trim() }));
  const correct = options.filter(option => option.correct);
  if (options.length < 2 || options.length > LETTERS.length || correct.length !== 1) return null;
  return {
    type: explicit.type === 'predict' ? 'predict' : 'choose',
    options,
    waitSeconds: Math.max(3, Math.min(15, Math.round(explicit.waitSeconds ?? scene.pauseSeconds ?? 5))),
    prompt: explicit.prompt ?? 'Choose one, then explain why.',
  };
}

// Explicit schema first; otherwise derive from a fraction choice prompt and the
// fraction the answer scene actually resolves to. Returns null when the question
// has no unambiguous answer on screen — ambiguity must never be presented as a
// multiple-choice task.
export function fairInteractionFor(scenes, index) {
  const scene = scenes[index];
  if (!scene) return null;
  // An explicit prediction on the hook is allowed: it is a commitment device, not
  // a graded question, so no option is marked correct.
  if (scene.beat === 'hook' && scene.interaction?.type === 'predict') {
    const options = (scene.interaction.options ?? []).map(option => ({ ...option, label: String(option.label).trim() }));
    if (options.length < 2 || options.length > LETTERS.length) return null;
    return { type: 'predict', options, waitSeconds: Math.max(3, Math.min(15, Math.round(scene.interaction.waitSeconds ?? scene.pauseSeconds ?? 5))), prompt: scene.interaction.prompt ?? 'Make a prediction.' };
  }
  if (scene.beat !== 'question') return null;
  const answer = scenes[index + 1];
  if (!answer || answer.beat !== 'answer') return null;
  if (scene.interaction) return normalize(scene.interaction, scene);
  const items = scene.visual?.kind === 'recap' ? scene.visual.items : null;
  if (!Array.isArray(items) || items.length < 2 || items.length > LETTERS.length) return null;
  if (!items.every(item => fairFractionParts(item))) return null;
  const answerVisual = answer.visual;
  if (answerVisual?.kind !== 'fraction-bars') return null;
  const targets = [answerVisual.fraction, answerVisual.equivalent].filter(Boolean);
  if (!targets.length) return null;
  const options = items.map(label => ({ label, correct: equivalentToAny(label, targets) }));
  if (options.filter(option => option.correct).length !== 1) return null;
  return {
    type: 'choose',
    options,
    waitSeconds: Math.max(3, Math.min(15, Math.round(scene.pauseSeconds ?? 5))),
    prompt: 'Which one keeps the same amount?',
  };
}

export function fairInteractionList(scenes) {
  return scenes.map((_, index) => fairInteractionFor(scenes, index));
}

export { LETTERS as FAIR_CHOICE_LETTERS };
