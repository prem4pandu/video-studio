import { appendFile, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateLesson, normalizeBrief, validateLesson } from './plan.mjs';
import { fairOpenEnvironment, fairOpenReadiness } from './open-config.mjs';
import { fairCompose } from './composition.mjs';
import { fairNarrate, fairProbe } from './voice.mjs';
import { fairCommand, fairFileHash, fairHash, fairParseJsonOutput, fairReadJson, fairWriteJson } from './utils.mjs';
import { FAIR_DEFAULT_BPM, fairMixLesson, fairMusicLibrary, fairPrepareBed, fairSfxPlan, fairSfxWav } from './audio.mjs';
import { motionMetrics, pacingGateResults, teachingMetrics } from '../tools/teaching-metrics.mjs';

const require = createRequire(import.meta.url);
export const FAIR_RENDERER = join(dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs');
export const fairRendererKind = brief => brief.generationVersion === 'open-source' ? 'open-source' : 'hyperframes';

export async function fairRunPipeline(brief, directory, { signal, env = process.env, onProgress = () => {} } = {}) {
  brief = normalizeBrief(brief);
  if (fairRendererKind(brief) === 'open-source') {
    env = fairOpenEnvironment(env, brief);
    await onProgress({ stage: 'plan', progress: 2, message: 'Checking the local planner, critic, Manim renderer and selected footage dependencies.' });
    const readiness = await fairOpenReadiness({ env, brief, signal });
    if (!readiness.available) throw new Error(`Open-source generation needs setup: ${readiness.blockers.join(' ')}`);
  }
  await mkdir(directory, { recursive: true });
  const generationDir = join(directory, 'generation'), projectDir = join(directory, 'project');
  await mkdir(generationDir, { recursive: true });
  const lessonFile = join(generationDir, 'lesson.json'), cacheFile = join(generationDir, 'validated.json');
  const fingerprint = fairHash({ revision: 3, brief,
    model: brief.model || (brief.provider === 'openai' ? env.FAIR_OPENAI_MODEL || 'gpt-5.6-terra' : brief.provider === 'lmstudio' ? env.FAIR_LMSTUDIO_MODEL || 'qwen/qwen3.8-27b' : env.FAIR_MODEL || 'gpt-oss:20b'),
    reviewModel: brief.provider === 'openai' ? env.FAIR_OPENAI_REVIEW_MODEL || '' : brief.provider === 'lmstudio' ? env.FAIR_LMSTUDIO_REVIEW_MODEL || '' : env.FAIR_REVIEW_MODEL || '',
    endpoint: brief.provider === 'lmstudio' ? env.FAIR_LMSTUDIO_URL || 'http://127.0.0.1:1234/v1/' : env.FAIR_OLLAMA_URL || '' });
  let lesson;
  try {
    const cache = await fairReadJson(cacheFile);
    if (cache.fingerprint === fingerprint && cache.sha256 === await fairFileHash(lessonFile)) {
      const saved = await fairReadJson(lessonFile);
      lesson = validateLesson(saved, brief);
      if (saved.quality?.reviewed !== true) lesson = null;
      else lesson.quality = saved.quality;
    }
  } catch { lesson = null; }
  if (!lesson) {
    const attemptDir = join(generationDir, 'runs', randomUUID());
    lesson = await generateLesson(brief, { signal, env, outputDir: attemptDir,
      onProgress: event => onProgress({ ...event, stage: event.stage === 'reviewing' ? 'review' : 'plan', progress: event.stage === 'reviewing' ? 22 : 10 }) });
    await fairWriteJson(lessonFile, lesson);
    await fairWriteJson(cacheFile, { fingerprint, sha256: await fairFileHash(lessonFile) });
  }
  return fairRenderLesson(lesson, brief, directory, { signal, env, onProgress });
}

// Rendering is a separate stage: authored benchmarks retain their provenance and
// do not claim to have passed automatic generation or an educator's review.
export async function fairRenderLesson(lesson, brief, directory, { signal, env = process.env, onProgress = () => {}, origin = 'generated' } = {}) {
  brief = normalizeBrief(brief);
  const previousQuality = lesson.quality;
  lesson = validateLesson(lesson, brief);
  if (origin !== 'authored' && previousQuality?.reviewed !== true) throw new Error('Generated lessons require a completed teaching critique before rendering.');
  lesson.quality = { reviewed: origin !== 'authored' && previousQuality?.reviewed === true,
    warnings: [...new Set([...lesson.quality.warnings, ...(previousQuality?.warnings || [])])] };
  if (fairRendererKind(brief) === 'open-source') {
    const { fairRenderOpenLesson } = await import('./open-render.mjs');
    return fairRenderOpenLesson(lesson, brief, directory, { signal, env: fairOpenEnvironment(env, brief), onProgress, origin });
  }
  const generationDir = join(directory, 'generation'), projectDir = join(directory, 'project');
  await mkdir(generationDir, { recursive: true });
  await onProgress({ stage: 'review', progress: 28, message: origin === 'authored' ? 'Authored benchmark: structure and arithmetic checked; educator review remains pending.' : 'Lesson structure, arithmetic claims, and teaching critique passed.', lesson });
  const tracks = await fairNarrate(lesson, projectDir, { signal, env, brief, onProgress });
  await onProgress({ stage: 'composition', progress: 62, message: 'Timing the teaching visuals, presenter gestures, thinking pauses, and captions.' });
  const composition = await fairCompose(lesson, tracks, brief, projectDir);
  await fairWriteJson(join(projectDir, 'lesson.json'), lesson);
  const promptFiles = (await readdir(generationDir, { recursive: true })).filter(file => file.endsWith('-prompt.txt')).sort();
  await fairWriteJson(join(projectDir, 'prompts.json'), { prompts: await Promise.all(promptFiles.map(async file => ({ file, text: await readFile(join(generationDir, file), 'utf8') }))) });
  if (signal?.aborted) throw new Error('Generation cancelled.');
  await onProgress({ stage: 'composition', progress: 68, message: 'Checking the assembled video for layout, contrast, and playback errors.' });
  const logFile = join(directory, 'render.log');
  const log = text => { appendFile(logFile, text).catch(() => {}); };
  const runtimeEnv = { ...env, DO_NOT_TRACK: '1' };
  const check = await fairCommand(process.execPath, [FAIR_RENDERER, 'check', projectDir, '--json'], { env: runtimeEnv, signal, timeoutMs: 180_000, onOutput: log, allowFailure: true });
  const checkReport = fairParseJsonOutput(check.stdout);
  if (!checkReport.ok || checkReport.browserSkipped) throw new Error(`Video composition checks did not complete successfully. See render.log. ${(check.stderr || '').slice(-1500)}`);
  // The checker may fail only because it cannot write its history cache outside
  // the workspace. Its JSON report is the authority on layout and playback.
  const checkWarning = check.code === 0 ? null : 'The renderer could not write its check history cache; the check report itself passed.';
  await fairWriteJson(join(projectDir, 'render-check.json'), { command: 'hyperframes check', exitCode: check.code, stdout: check.stdout, stderr: check.stderr });
  await onProgress({ stage: 'render', progress: 76, message: `Rendering ${Math.round(composition.durationSeconds)} seconds of narrated video. This may take a few minutes.` });
  const draft = join(projectDir, 'lesson-voice.mp4'), output = join(projectDir, 'lesson.mp4');
  await fairCommand(process.execPath, [FAIR_RENDERER, 'render', projectDir, '--output', draft, '--fps', '30', '--quality', 'looks', '--workers', '2', '--strict'], { env: runtimeEnv, signal, timeoutMs: 30 * 60_000, onOutput: log });
  // Phase A: the renderer mixes only narration, so the music bed and teaching
  // sounds are added here in one deterministic ffmpeg pass. The rendered audio
  // is the voice stem; picture is stream-copied, never re-encoded.
  let audio = null;
  if (brief.audio === 'music') {
    const cuts = composition.audioCues?.cuts ?? composition.scenes.map(scene => scene.start).filter(time => time > 0);
    const pauses = composition.audioCues?.pauses ?? composition.scenes.filter(scene => scene.beat === 'question' && scene.pauseSeconds > 0)
      .map(scene => ({ start: scene.speechStart + scene.track.durationSeconds, end: scene.speechStart + scene.track.durationSeconds + scene.pauseSeconds }));
    const events = fairSfxPlan({ scenes: composition.scenes, cuts, bpm: FAIR_DEFAULT_BPM, extra: composition.sfxCues ?? [] });
    const sfxFile = join(projectDir, 'audio', 'sfx.wav');
    await mkdir(join(projectDir, 'audio'), { recursive: true });
    await writeFile(sfxFile, fairSfxWav(events, composition.durationSeconds));
    const library = await fairMusicLibrary(process.cwd());
    const bed = await fairPrepareBed({ directory: projectDir, library, mood: 'focus', durationSeconds: composition.durationSeconds, bpm: FAIR_DEFAULT_BPM, root: process.cwd(), env, signal });
    const mixed = await fairMixLesson({ videoFile: draft, outputFile: output, bedFile: bed.path, sfxFile, durationSeconds: composition.durationSeconds, pauses, env, signal, onProgress });
    // lesson-voice.mp4 is kept: it is the re-mix source and a music-free alternative.
    audio = { source: bed.source, mood: bed.mood, bpm: bed.bpm, bed: { title: bed.entry?.title ?? 'unknown', licence: bed.entry?.licence ?? '', file: bed.source === 'library' ? bed.entry?.file ?? '' : 'audio/bed.wav', sha256: bed.sha256 }, effects: events.map(event => ({ name: event.name, at: Number(event.at.toFixed(3)) })), graph: mixed.graph };
    await fairWriteJson(join(projectDir, 'audio-mix.json'), audio);
  } else {
    await copyFile(draft, output);
    await rm(draft, { force: true });
  }
  await onProgress({ stage: 'verify', progress: 95, message: 'Verifying the exported video, audio track, captions, and objective coverage.' });
  const probe = await fairProbe(output, { env, signal });
  const volume = await fairCommand(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-i', output, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { env, signal });
  const meanDb = Number(volume.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const durationSeconds = Number(probe.format?.duration);
  // One glanceable contact sheet per render so a reviewer can scan the whole
  // lesson without playing it. Sixteen tiles at 480px wide each.
  const sheetFile = join(projectDir, 'contact-sheet.jpg');
  const sheetSpacing = Math.max(4, Math.ceil((Number.isFinite(durationSeconds) ? durationSeconds : composition.durationSeconds) / 16));
  const sheet = await fairCommand(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', output,
    '-vf', `fps=1/${sheetSpacing},scale=480:-2,tile=4x4:padding=6:margin=6`, '-frames:v', '1', sheetFile], { env, signal, allowFailure: true });
  const contactSheet = sheet.code === 0 && ((await stat(sheetFile).catch(() => null))?.size ?? 0) > 0 ? 'contact-sheet.jpg' : null;
  const alignedScenes = tracks.filter(track => track.wordTimingSource === 'forced-alignment' || track.wordTimingSource === 'provider-alignment').length;
  // Pacing and motion audits ride in the report: the DOM audit counts teaching
  // changes, the frame audit measures whether pixels actually moved.
  const pacing = await teachingMetrics(projectDir).then(metrics => ({ ...metrics.summary, gates: pacingGateResults(metrics.summary) })).catch(() => null);
  const motion = await motionMetrics(output, { env }).then(({ file, ...metrics }) => metrics).catch(() => null);
  const checks = [
    { name: 'Video stream', passed: probe.streams?.some(stream => stream.codec_type === 'video') === true, detail: 'MP4 contains a video stream.' },
    { name: 'Narration track', passed: probe.streams?.some(stream => stream.codec_type === 'audio') === true, detail: 'MP4 contains an audio stream.' },
    { name: 'Non-silent audio', passed: Number.isFinite(meanDb) && meanDb > -60, detail: `Exported audio mean level: ${Number.isFinite(meanDb) ? meanDb : 'unavailable'} dBFS. Voice naturalness needs a listening review.` },
    { name: 'Full timeline', passed: Number.isFinite(durationSeconds) && Math.abs(durationSeconds - composition.durationSeconds) < 1, detail: `Expected ${composition.durationSeconds.toFixed(2)}s, measured ${durationSeconds.toFixed(2)}s.` },
    { name: 'Captions', passed: composition.captions.length > 0 && (await readFile(join(projectDir, 'captions.vtt'), 'utf8')).startsWith('WEBVTT'),
      detail: alignedScenes === tracks.length ? 'WebVTT captions are timed by measured word alignment.'
        : alignedScenes ? `WebVTT captions are generated from the spoken script; word timing is measured for ${alignedScenes} of ${tracks.length} scenes and estimated for the rest.`
        : 'WebVTT captions are generated from the spoken script; word timing is estimated.' },
    ...(audio ? [{ name: 'Music and sound design', passed: true, detail: `${audio.source === 'library' ? `Licensed bed: ${audio.bed.title}` : 'Synthesised placeholder bed — add a licensed track to assets/audio/music-manifest.json to replace it.'} ${audio.effects.length} placed effects, ${audio.bpm} BPM, bed ducked under the voice.` }] : []),
  ];
  if (brief.generationVersion === 'quality') {
    const beats = new Set(lesson.scenes.map(scene => scene.beat));
    const requiredBeats = ['hook', 'concept', 'example', 'misconception', 'question', 'answer', 'recap'];
    checks.unshift(
      { name: 'Approved visual treatment', passed: composition.animation?.type === 'koobits-approved-v2' && composition.qualityProof?.treatment === 'approved-proof-port-v2', detail: 'Quality mode rendered through the approved proof-derived teaching-film treatment.' },
      { name: 'Semantic focus targets', passed: composition.qualityProof?.semanticTargets === true, detail: 'Every instructional event names the visual object it focuses or changes.' },
      { name: 'Progressive teaching reveals', passed: composition.qualityProof?.progressiveReveal === true, detail: 'Scenes expose narration-anchored teaching events instead of a whole-card entrance.' },
      { name: 'Protected answer windows', passed: composition.qualityProof?.protectedResponses === true, detail: 'Question response windows remain separate from the following answer scene.' },
      { name: 'Complete teaching loop', passed: requiredBeats.every(beat => beats.has(beat)), detail: 'Hook, concept, example, misconception repair, learner question, explained answer and recap are present.' },
      { name: 'Guided and independent practice', passed: lesson.scenes.filter(scene => scene.beat === 'question').length >= 2, detail: 'The lesson includes both a guided question and a separate transfer question.' },
      { name: 'Protected response time', passed: lesson.scenes.filter(scene => scene.beat === 'question').every(scene => scene.pauseSeconds >= 5), detail: 'Every learner question reserves at least five seconds before feedback.' },
    );
  }
  const warnings = [...lesson.quality.warnings, ...lesson.curriculum.warnings, ...(checkWarning ? [checkWarning] : []),
    alignedScenes === tracks.length
      ? 'Caption and visual reveal timings are measured by local forced alignment; alignment locates approved words but does not verify them. Listen to the result to review synchronization.'
      : 'Caption and visual reveal timings are estimated within measured narration scenes. Listen to the result to review synchronization.',
    ...(brief.avatar === 'none' ? [] : ['Presenter mouth motion follows audio energy; it is not phoneme-accurate lip sync.']),
    ...(brief.intro !== 'none' && !composition.intro?.applied ? ['The title sequence is only wired into the classic renderer; this lesson rendered without it.'] : []),
    ...(brief.audio === 'music' ? ['Music is a level bed only; listen for it competing with the voice in busy scenes.'] : []),
    ...(pacing?.gates?.some(gate => !gate.passed) ? [`Pacing audit flagged: ${pacing.gates.filter(gate => !gate.passed).map(gate => `${gate.name} (${gate.value})`).join('; ')}.`] : []),
    ...(motion && (motion.frozenPercent > 10 || motion.visiblePercent < 40) ? [`Frame-motion audit flagged: ${motion.frozenPercent}% of seconds frozen, ${motion.visiblePercent}% visibly animated.`] : [])];
  if (durationSeconds > brief.targetSeconds * 1.15) warnings.push(`The lesson runs ${Math.round(durationSeconds)}s versus the ${brief.targetSeconds}s target; it was not sped up or cut to fit.`);
  const coverage = lesson.objectives.map(objective => ({ ...objective,
    explained: lesson.scenes.some(scene => ['concept', 'example', 'misconception'].includes(scene.beat) && scene.objectiveIds.includes(objective.id)),
    practised: lesson.scenes.some(scene => scene.beat === 'question' && scene.objectiveIds.includes(objective.id)) }));
  const report = { passed: checks.every(check => check.passed), status: origin === 'authored' ? 'authored-benchmark' : 'generated-draft', origin, educatorApproved: false,
    durationSeconds, targetSeconds: brief.targetSeconds, scenes: lesson.scenes.length, coverage, warnings: [...new Set(warnings)], checks,
    voice: tracks[0]?.quality, animation: composition.animation || { name: 'Classic teaching diagrams' },
    timing: { wordTimingSource: alignedScenes === tracks.length ? (tracks[0]?.wordTimingSource ?? 'estimated') : alignedScenes ? 'mixed' : 'estimated',
      scenesAligned: alignedScenes, scenesTotal: tracks.length,
      aligner: tracks.find(track => track.alignment)?.alignment ?? null },
    intro: composition.intro ?? { style: null, applied: false }, audio,
    contactSheet, pacing, motion,
    video: { sha256: await fairFileHash(output), bytes: (await stat(output)).size },
    generatedAt: new Date().toISOString(), renderer: 'hyperframes/0.8.161' };
  await fairWriteJson(join(projectDir, 'quality-report.json'), report);
  if (!report.passed) throw new Error(`Export verification failed: ${checks.filter(check => !check.passed).map(check => check.name).join(', ')}`);
  await fairWriteJson(join(projectDir, 'manifest.json'), { revision: 1, brief, lessonHash: fairHash(lesson),
    artifacts: await Promise.all(['lesson.mp4', 'captions.vtt', 'transcript.txt', 'lesson.json', 'prompts.json', 'index.html', 'quality-report.json', ...(audio ? ['audio-mix.json'] : []), ...(contactSheet ? [contactSheet] : [])].map(async file => ({ file, sha256: await fairFileHash(join(projectDir, file)) }))),
    audio: tracks.map(track => ({ file: track.file, sha256: track.sha256 })), music: audio ? { source: audio.source, licence: audio.bed.licence } : null,
    status: report.status, origin });
  return { lesson, report, projectDir };
}
