import { appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairNarrate, fairProbe, fairVoiceConfig } from './voice.mjs';
import { fairCueTimes } from './animation.mjs';
import { fairBaseTenState } from './base-ten.mjs';
import { fairCommand, fairFileHash, fairHash, fairTimestamp, fairWriteJson } from './utils.mjs';
import { fairGenerateWanClip } from './wan.mjs';
import { fairManimPython } from './open-config.mjs';

const FAIR_SCRIPT = fileURLToPath(new URL('../scripts/manim-scene.py', import.meta.url));
const FAIR_KINDS = new Set(['place-value', 'equation', 'comparison', 'number-line', 'steps', 'recap', 'base-ten']);
const FAIR_INTRO_SECONDS = 5;

export function fairOpenRenderPlan(lesson, tracks, { introSeconds = FAIR_INTRO_SECONDS } = {}) {
  if (!Number.isFinite(introSeconds) || (introSeconds !== 0 && introSeconds < .5) || introSeconds > FAIR_INTRO_SECONDS) throw new Error('Wan establishing shot must be zero or between 0.5 and 5 seconds.');
  let start = introSeconds;
  const scenes = lesson.scenes.map(scene => {
    const track = tracks.find(item => item.sceneId === scene.id);
    if (!track || !Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0) throw new Error(`Missing measured narration for ${scene.id}.`);
    const durationSeconds = Math.ceil((track.durationSeconds + scene.pauseSeconds + .7) * 30) / 30;
    // Deliberately omit every untrusted visual/title field on a practice question.
    const rendered = scene.beat === 'question' ? { id: scene.id, beat: 'question', title: 'Your turn', narration: scene.narration } : { ...scene };
    if (scene.beat !== 'question' && !FAIR_KINDS.has(scene.visual.kind)) throw new Error(`Unsupported open-source visual: ${scene.visual.kind}`);
    if (scene.beat !== 'question' && scene.visual.kind === 'base-ten') {
      rendered.state = fairBaseTenState(scene.visual);
      rendered.cues = fairCueTimes(scene, track).map(cue => ({ ...cue, at: .35 + cue.at }));
    }
    const result = { ...rendered, startSeconds: start, durationSeconds, narrationSeconds: track.durationSeconds };
    start += durationSeconds;
    return result;
  });
  return { revision: 1, width: 1280, height: 720, fps: 30, introSeconds, durationSeconds: start, scenes };
}

export function fairOpenCaptions(plan, tracks) {
  const captions = [];
  for (const scene of plan.scenes) {
    const track = tracks.find(item => item.sceneId === scene.id);
    const words = scene.narration.split(/\s+/).filter(Boolean);
    const alignment = track.words?.length === words.length && track.words.every(word => Number.isFinite(word.startSeconds) && Number.isFinite(word.endSeconds));
    for (let at = 0; at < words.length; at += 10) {
      const end = Math.min(words.length, at + 10);
      captions.push({ text: words.slice(at, end).join(' '), start: scene.startSeconds + .35 + (alignment ? track.words[at].startSeconds : at / words.length * track.durationSeconds),
        end: scene.startSeconds + .35 + (alignment ? track.words[end - 1].endSeconds : end / words.length * track.durationSeconds) });
    }
  }
  return { captions, vtt: `WEBVTT\n\n${captions.map((cue, index) => `${index + 1}\n${fairTimestamp(cue.start)} --> ${fairTimestamp(cue.end)}\n${cue.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}\n`).join('\n')}` };
}

export async function fairRenderOpenLesson(lesson, brief, directory, { signal, env = process.env, onProgress = () => {}, origin = 'generated', command = fairCommand, narrate = fairNarrate, generateWan = fairGenerateWanClip, probe = fairProbe } = {}) {
  if (origin !== 'authored' && lesson.quality?.reviewed !== true) throw new Error('Generated lessons require a completed teaching critique before rendering.');
  if (brief.provider !== 'local') throw new Error('Open-source generation requires a local lesson model.');
  const voice = fairVoiceConfig(env, brief);
  if (!['qwentts', 'piper', 'kokoro'].includes(voice.provider)) throw new Error('Open-source generation requires Qwen3-TTS, Piper or Kokoro narration.');
  const projectDir = resolve(directory, 'project');
  await mkdir(projectDir, { recursive: true });
  const log = text => { appendFile(join(directory, 'render.log'), text).catch(() => {}); };
  const runtime = { env, signal, onOutput: log };
  const configuredPython = fairManimPython(env);
  const python = configuredPython.includes('/') ? resolve(configuredPython) : configuredPython;
  let manim;
  try { manim = await command(python, ['-c', 'import manim; print(manim.__version__)'], runtime); }
  catch { throw new Error('Manim is unavailable. Install Manim Community and configure FAIR_MANIM_PYTHON with its Python interpreter.'); }
  await command(env.FAIR_FFMPEG || 'ffmpeg', ['-version'], runtime);
  const tracks = await narrate(lesson, projectDir, { signal, env, brief, onProgress });
  await fairWriteJson(join(projectDir, 'narration.json'), tracks);
  await fairWriteJson(join(projectDir, 'lesson.json'), lesson);
  await writeFile(join(projectDir, 'transcript.txt'), `${lesson.title}\n\n${lesson.scenes.map(scene => `${scene.title}\n${scene.narration}${scene.pauseSeconds ? `\n[Think for ${scene.pauseSeconds} seconds.]` : ''}`).join('\n\n')}\n`);
  await copyFile(FAIR_SCRIPT, join(projectDir, 'manim-scene.py'));
  let promptFiles = [];
  try { promptFiles = (await readdir(join(directory, 'generation'), { recursive: true })).filter(file => file.endsWith('-prompt.txt')).sort(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const prompt = `A quiet, welcoming illustrated learning room, soft daylight, stationary camera, gentle natural movement, no text, no numerals, no equations, no logos, no speaking people. Establishing scene for a lesson whose title is ${JSON.stringify(lesson.title)}. No mathematical claims or counted objects.`;
  const withFootage = brief.footage === 'wan';
  await fairWriteJson(join(projectDir, 'prompts.json'), { wan: withFootage ? prompt : null, prompts: await Promise.all(promptFiles.map(async file => ({ file, text: await readFile(join(directory, 'generation', file), 'utf8') }))) });
  let clipFile, introSeconds = 0, footage = { enabled: false, reason: 'This lesson uses deterministic teaching animation only.' };
  if (withFootage) {
    await onProgress({ stage: 'footage', progress: 62, message: 'Generating a short Wan establishing scene; exact teaching diagrams are rendered separately.' });
    const clip = await generateWan({ prompt, directory: join(projectDir, 'assets'), signal, env, onProgress: event => onProgress(typeof event === 'string' ? { stage: 'footage', progress: 62, message: event } : event) });
    clipFile = resolve(projectDir, 'assets', clip.file);
    if (clip.sha256 !== await fairFileHash(clipFile)) throw new Error('Wan clip hash verification failed.');
    const clipMedia = await probe(clipFile, { env, signal });
    const clipSeconds = Number(clipMedia.format?.duration);
    if (!Number.isFinite(clipSeconds) || clipSeconds < .5 || !clipMedia.streams?.some(stream => stream.codec_type === 'video')) throw new Error('Wan output must contain at least half a second of video.');
    introSeconds = Math.floor(Math.min(FAIR_INTRO_SECONDS, clipSeconds) * 30) / 30;
    footage = { ...clip.provenance, enabled: true, sha256: clip.sha256, durationSeconds: introSeconds, usage: 'Silent establishing shot; not evidence of mathematical correctness or character continuity.' };
  }
  const plan = fairOpenRenderPlan(lesson, tracks, { introSeconds });
  const { captions, vtt } = fairOpenCaptions(plan, tracks);
  plan.captions = captions;
  await fairWriteJson(join(projectDir, 'fair-render-plan.json'), plan);
  await writeFile(join(projectDir, 'captions.vtt'), vtt);
  await fairWriteJson(join(projectDir, 'wan-provenance.json'), footage);
  await onProgress({ stage: 'render', progress: 76, message: 'Rendering measured narration scenes with Manim and assembling the lesson with FFmpeg.' });
  const silent = join(projectDir, 'fair-teaching.mp4');
  await command(python, [join(projectDir, 'manim-scene.py'), join(projectDir, 'fair-render-plan.json'), silent], { ...runtime, cwd: projectDir, timeoutMs: 30 * 60_000 });
  const output = join(projectDir, 'lesson.mp4');
  const audioOffset = withFootage ? 2 : 1;
  const filters = [
    ...(withFootage ? [
      `[0:v]trim=duration=${introSeconds},setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[vintro]`,
      '[1:v]setpts=PTS-STARTPTS,setsar=1,fps=30,format=yuv420p[vteach]',
      '[vintro][vteach]concat=n=2:v=1:a=0[v]',
    ] : ['[0:v]setpts=PTS-STARTPTS,setsar=1,fps=30,format=yuv420p[v]']),
    ...tracks.map((track, index) => `[${index + audioOffset}:a]aresample=24000,adelay=${Math.round((plan.scenes[index].startSeconds + .35) * 1000)}:all=1[a${index}]`),
    `${tracks.map((_, index) => `[a${index}]`).join('')}amix=inputs=${tracks.length}:normalize=0,apad,atrim=duration=${plan.durationSeconds}[a]`,
  ];
  const inputArgs = tracks.flatMap(track => ['-i', join(projectDir, track.file)]);
  await command(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...(withFootage ? ['-i', clipFile] : []), '-i', silent, ...inputArgs, '-i', join(projectDir, 'captions.vtt'),
    '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-map', `${tracks.length + audioOffset}:0`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', '-t', String(plan.durationSeconds), output], { ...runtime, timeoutMs: 30 * 60_000 });
  await onProgress({ stage: 'verify', progress: 95, message: 'Checking video duration, narration volume, embedded captions and artifact hashes.' });
  const media = await probe(output, { env, signal });
  const volume = await command(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-i', output, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], runtime);
  const meanDb = Number(volume.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const durationSeconds = Number(media.format?.duration);
  const checks = [
    { name: 'Video stream', passed: media.streams?.some(stream => stream.codec_type === 'video') === true },
    { name: 'Narration track', passed: media.streams?.some(stream => stream.codec_type === 'audio') === true },
    { name: 'Non-silent audio', passed: Number.isFinite(meanDb) && meanDb > -60, detail: `${meanDb} dBFS` },
    { name: 'Full timeline', passed: Number.isFinite(durationSeconds) && Math.abs(durationSeconds - plan.durationSeconds) < .2, detail: `Expected ${plan.durationSeconds.toFixed(3)}s; measured ${durationSeconds}s.` },
    { name: 'Captions', passed: captions.length > 0 && media.streams?.some(stream => stream.codec_type === 'subtitle') === true },
    ...(env.FAIR_ALIGNMENT_MODEL_DIR ? [{ name: 'Word alignment', passed: tracks.every(track => track.wordTimingSource === 'forced-alignment'), detail: 'Approved words are aligned to audio; spoken-script accuracy still requires a listening or ASR review.' }] : []),
  ];
  const report = { passed: checks.every(check => check.passed), status: origin === 'authored' ? 'authored-benchmark' : 'generated-draft', origin, educatorApproved: false,
    renderer: `manim/${manim.stdout.trim()} + ffmpeg`, contentVersion: 'open-source', durationSeconds, targetSeconds: brief.targetSeconds, scenes: lesson.scenes.length,
    coverage: lesson.objectives.map(objective => ({ ...objective, explained: lesson.scenes.some(scene => ['concept', 'example', 'misconception'].includes(scene.beat) && scene.objectiveIds.includes(objective.id)), practised: lesson.scenes.some(scene => scene.beat === 'question' && scene.objectiveIds.includes(objective.id)) })),
    checks, warnings: [...new Set([...(lesson.quality?.warnings || []), ...(lesson.curriculum?.warnings || []), ...(withFootage ? ['Wan imagery is an unreviewed establishing shot. Review the exported lesson before publishing.'] : []), 'Captions and visual cues use narration alignment when available and estimated word timing otherwise. No talking presenter or character continuity is claimed.', ...(durationSeconds > brief.targetSeconds * 1.15 ? ['The lesson exceeds the requested duration; teaching content was not cut or sped up.'] : [])])],
    voice: tracks[0]?.quality, timing: { wordSources: [...new Set(tracks.map(track => track.wordTimingSource || 'estimated'))], alignment: tracks[0]?.alignment }, animation: { name: withFootage ? 'Manim teaching diagrams with Wan establishing footage' : 'Manim teaching diagrams', footage: withFootage ? 'wan' : 'none' }, video: { sha256: await fairFileHash(output), bytes: (await stat(output)).size }, generatedAt: new Date().toISOString() };
  await fairWriteJson(join(projectDir, 'quality-report.json'), report);
  if (!report.passed) throw new Error(`Export verification failed: ${checks.filter(check => !check.passed).map(check => check.name).join(', ')}`);
  const artifacts = ['lesson.mp4', 'captions.vtt', 'transcript.txt', 'lesson.json', 'narration.json', 'prompts.json', 'manim-scene.py', 'fair-render-plan.json', 'wan-provenance.json', 'quality-report.json'];
  await fairWriteJson(join(projectDir, 'manifest.json'), { revision: 1, brief, lessonHash: fairHash(lesson), renderer: report.renderer, artifacts: await Promise.all(artifacts.map(async file => ({ file, sha256: await fairFileHash(join(projectDir, file)) }))), audio: tracks.map(track => ({ file: track.file, sha256: track.sha256 })), status: report.status, origin });
  return { lesson, report, projectDir };
}
