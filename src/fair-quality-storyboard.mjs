const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function wordAnchors(track, count) {
  if (!count) return [];
  const words = (track.words || []).filter(word => Number.isFinite(word.startSeconds));
  if (words.length) return Array.from({ length: count }, (_, index) => {
    const word = words[Math.min(words.length - 1, Math.floor((index + 0.35) / count * words.length))];
    return clamp(0.35 + word.startSeconds, 0.45, 0.35 + track.durationSeconds - 0.2);
  });
  return Array.from({ length: count }, (_, index) =>
    clamp(0.45 + (index + 0.35) / count * Math.max(0.8, track.durationSeconds - 0.7), 0.45, 0.35 + track.durationSeconds - 0.2));
}

const focusLabel = scene => ({
  hook: 'Notice the question', concept: 'Follow the idea', example: 'Watch each step',
  misconception: 'Compare the meanings', question: 'Your thinking time',
  answer: 'Check each step', recap: 'Keep this idea',
})[scene.beat] || 'Focus here';

export function fairQualityScenePlan(scene, track, revealCount) {
  const timingSource = track.words?.length ? (track.wordTimingSource || track.timingSource || 'provider-words') : 'estimated';
  const anchors = wordAnchors(track, Math.max(1, revealCount));
  const events = [{ kind: 'heading', target: 'heading', at: 0.06, timingSource: 'scene' }];
  for (let index = 0; index < revealCount; index++) {
    events.push({ kind: 'reveal', target: `reveal-${index}`, at: anchors[index], label: focusLabel(scene), timingSource });
  }
  if (!revealCount) events.push({ kind: 'focus', target: 'visual', at: anchors[0], label: focusLabel(scene), timingSource });
  if (scene.beat === 'question') {
    const open = 0.35 + track.durationSeconds;
    events.push({ kind: 'response-open', target: 'response-window', at: open, timingSource: 'measured-audio' });
    events.push({ kind: 'response-close', target: 'response-window', at: open + scene.pauseSeconds, timingSource: 'declared-hold' });
  }
  return { timingSource, events };
}

export function fairQualityProof(scenes) {
  const proof = scenes.map(scene => ({
    sceneId: scene.id,
    beat: scene.beat,
    timingSource: scene.qualityPlan.timingSource,
    events: scene.qualityPlan.events,
    responseProtected: scene.beat !== 'question' || (
      scene.pauseSeconds >= 5 &&
      scene.qualityPlan.events.some(event => event.kind === 'response-open') &&
      scene.qualityPlan.events.some(event => event.kind === 'response-close')
    ),
  }));
  return {
    treatment: 'approved-proof-port-v2',
    nativeCanvas: '1920x1080',
    semanticTargets: proof.every(scene => scene.events.every(event => Boolean(event.target))),
    progressiveReveal: proof.every(scene => scene.events.some(event => ['reveal', 'focus', 'show-objects', 'transform', 'reveal-notation', 'response-open'].includes(event.kind))),
    protectedResponses: proof.filter(scene => scene.beat === 'question').every(scene => scene.responseProtected),
    scenes: proof,
  };
}
