import { appendFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateLesson, normalizeBrief, validateLesson } from './fair-plan.mjs';
import { fairOpenEnvironment, fairOpenReadiness } from './fair-open-config.mjs';
import { fairCompose } from './fair-composition.mjs';
import { fairNarrate, fairProbe } from './fair-voice.mjs';
import { fairCommand, fairFileHash, fairHash, fairReadJson, fairWriteJson } from './fair-utils.mjs';

const require = createRequire(import.meta.url);
export const FAIR_RENDERER = join(dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs');
export const fairRendererKind = brief => brief.generationVersion === 'open-source' ? 'open-source' : 'hyperframes';

export async function fairRunPipeline(brief, directory, { signal, env = process.env, onProgress = () => {} } = {}) {
  brief = normalizeBrief(brief);
  if (fairRendererKind(brief) === 'open-source') {
    env = fairOpenEnvironment(env, brief);
    await onProgress({ stage: 'plan', progress: 2, message: 'Checking the open-source planner, Wan models and Manim renderer.' });
    const readiness = await fairOpenReadiness({ env, signal });
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
    const { fairRenderOpenLesson } = await import('./fair-open-render.mjs');
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
  const check = await fairCommand(process.execPath, [FAIR_RENDERER, 'check', projectDir, '--json'], { env: runtimeEnv, signal, timeoutMs: 180_000, onOutput: log });
  const checkReport = JSON.parse(check.stdout);
  if (!checkReport.ok || checkReport.browserSkipped) throw new Error('Video composition checks did not complete successfully. See render.log.');
  await fairWriteJson(join(projectDir, 'render-check.json'), { command: 'hyperframes check', stdout: check.stdout, stderr: check.stderr });
  await onProgress({ stage: 'render', progress: 76, message: `Rendering ${Math.round(composition.durationSeconds)} seconds of narrated video. This may take a few minutes.` });
  const output = join(projectDir, 'lesson.mp4');
  await fairCommand(process.execPath, [FAIR_RENDERER, 'render', projectDir, '--output', output, '--fps', '30', '--quality', 'looks', '--workers', '2', '--strict'], { env: runtimeEnv, signal, timeoutMs: 30 * 60_000, onOutput: log });
  await onProgress({ stage: 'verify', progress: 95, message: 'Verifying the exported video, audio track, captions, and objective coverage.' });
  const probe = await fairProbe(output, { env, signal });
  const volume = await fairCommand(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-i', output, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { env, signal });
  const meanDb = Number(volume.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const durationSeconds = Number(probe.format?.duration);
  const checks = [
    { name: 'Video stream', passed: probe.streams?.some(stream => stream.codec_type === 'video') === true, detail: 'MP4 contains a video stream.' },
    { name: 'Narration track', passed: probe.streams?.some(stream => stream.codec_type === 'audio') === true, detail: 'MP4 contains an audio stream.' },
    { name: 'Non-silent audio', passed: Number.isFinite(meanDb) && meanDb > -60, detail: `Exported audio mean level: ${Number.isFinite(meanDb) ? meanDb : 'unavailable'} dBFS. Voice naturalness needs a listening review.` },
    { name: 'Full timeline', passed: Number.isFinite(durationSeconds) && Math.abs(durationSeconds - composition.durationSeconds) < 1, detail: `Expected ${composition.durationSeconds.toFixed(2)}s, measured ${durationSeconds.toFixed(2)}s.` },
    { name: 'Captions', passed: composition.captions.length > 0 && (await readFile(join(projectDir, 'captions.vtt'), 'utf8')).startsWith('WEBVTT'), detail: 'WebVTT captions are generated from the spoken script; word timing is estimated.' },
  ];
  if (brief.generationVersion === 'quality') {
    const beats = new Set(lesson.scenes.map(scene => scene.beat));
    const requiredBeats = ['hook', 'concept', 'example', 'misconception', 'question', 'answer', 'recap'];
    checks.unshift(
      { name: 'Approved visual treatment', passed: composition.animation?.type === 'koobits-quality-v1', detail: 'Quality mode rendered through the dedicated KooBits-inspired teaching-film treatment.' },
      { name: 'Complete teaching loop', passed: requiredBeats.every(beat => beats.has(beat)), detail: 'Hook, concept, example, misconception repair, learner question, explained answer and recap are present.' },
      { name: 'Guided and independent practice', passed: lesson.scenes.filter(scene => scene.beat === 'question').length >= 2, detail: 'The lesson includes both a guided question and a separate transfer question.' },
      { name: 'Protected response time', passed: lesson.scenes.filter(scene => scene.beat === 'question').every(scene => scene.pauseSeconds >= 5), detail: 'Every learner question reserves at least five seconds before feedback.' },
    );
  }
  const warnings = [...lesson.quality.warnings, ...lesson.curriculum.warnings,
    'Caption and visual reveal timings are estimated within measured narration scenes. Listen to the result to review synchronization.',
    ...(brief.avatar === 'none' ? [] : ['Presenter mouth motion follows audio energy; it is not phoneme-accurate lip sync.'])];
  if (durationSeconds > brief.targetSeconds * 1.15) warnings.push(`The lesson runs ${Math.round(durationSeconds)}s versus the ${brief.targetSeconds}s target; it was not sped up or cut to fit.`);
  const coverage = lesson.objectives.map(objective => ({ ...objective,
    explained: lesson.scenes.some(scene => ['concept', 'example', 'misconception'].includes(scene.beat) && scene.objectiveIds.includes(objective.id)),
    practised: lesson.scenes.some(scene => scene.beat === 'question' && scene.objectiveIds.includes(objective.id)) }));
  const report = { passed: checks.every(check => check.passed), status: origin === 'authored' ? 'authored-benchmark' : 'generated-draft', origin, educatorApproved: false,
    durationSeconds, targetSeconds: brief.targetSeconds, scenes: lesson.scenes.length, coverage, warnings: [...new Set(warnings)], checks,
    voice: tracks[0]?.quality, animation: composition.animation || { name: 'Classic teaching diagrams' },
    video: { sha256: await fairFileHash(output), bytes: (await stat(output)).size },
    generatedAt: new Date().toISOString(), renderer: 'hyperframes/0.8.161' };
  await fairWriteJson(join(projectDir, 'quality-report.json'), report);
  if (!report.passed) throw new Error(`Export verification failed: ${checks.filter(check => !check.passed).map(check => check.name).join(', ')}`);
  await fairWriteJson(join(projectDir, 'manifest.json'), { revision: 1, brief, lessonHash: fairHash(lesson),
    artifacts: await Promise.all(['lesson.mp4', 'captions.vtt', 'transcript.txt', 'lesson.json', 'prompts.json', 'index.html', 'quality-report.json'].map(async file => ({ file, sha256: await fairFileHash(join(projectDir, file)) }))),
    audio: tracks.map(track => ({ file: track.file, sha256: track.sha256 })), status: report.status, origin });
  return { lesson, report, projectDir };
}
