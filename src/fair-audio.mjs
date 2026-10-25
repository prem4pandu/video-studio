// Phase A audio: a music bed, deterministic sound effects, and one mixed output.
//
// Design rules this module enforces:
//   - Nothing is downloaded at generation time. The bed comes from a checked-in,
//     licence-audited library (assets/audio/music-manifest.json); if no licensed
//     track is available a synthesised placeholder is used so the pipeline still
//     runs end to end. The report always says which one was used.
//   - Sound effects are synthesised here from a seeded noise source, so they are
//     byte-identical across runs and carry no licence.
//   - The mix is a single ffmpeg graph: voice normalised, bed ducked under the
//     voice, bed thinned during answer-free thinking pauses, mild limiter, one
//     loudness target.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fairCommand, fairFileHash, fairWriteJson } from './fair-utils.mjs';

export const FAIR_SAMPLE_RATE = 24000;
// Shared with the composer so an intro card can be a whole number of beats.
export const FAIR_DEFAULT_BPM = 88;
// Bed sits roughly 12-14 dB under the voice mean, then the sidechain ducks it further
// while the teacher is speaking. The pause value thins the bed when the voice stops
// so the duck release cannot make the music rise into a thinking pause.
export const FAIR_BED_GAIN = 0.26;
export const FAIR_PAUSE_BED_GAIN = 0.45;
export const FAIR_SFX_GAIN = 0.85;
export const FAIR_MUSIC_MANIFEST = 'assets/audio/music-manifest.json';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function seeded(seed) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296 * 2 - 1;
  };
}

export function fairWav(samples, sampleRate = FAIR_SAMPLE_RATE) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index++) {
    buffer.writeInt16LE(Math.round(clamp(samples[index], -1, 1) * 32767), 44 + index * 2);
  }
  return buffer;
}

// Every recipe is (time, noise) -> amplitude. No Math.random anywhere: the same
// name always produces the same waveform.
const SFX_RECIPES = {
  tick: { seconds: 0.06, gain: 0.62, render: (t, noise) => Math.sin(TAU * 1500 * t) * Math.exp(-t / 0.010) * 0.7 + noise() * Math.exp(-t / 0.004) * 0.18 },
  click: { seconds: 0.09, gain: 0.55, render: t => Math.sin(TAU * 190 * t) * Math.exp(-t / 0.022) * 0.75 + Math.sin(TAU * 1900 * t) * Math.exp(-t / 0.005) * 0.22 },
  pop: { seconds: 0.14, gain: 0.5, render: t => Math.sin(TAU * (330 * t + 430 * t * t / 0.14)) * Math.exp(-t / 0.045) * 0.8 },
  chime: { seconds: 0.9, gain: 0.42, render: t => Math.sin(TAU * 880 * t) * Math.exp(-t / 0.28) * 0.5 + Math.sin(TAU * 1320 * t) * Math.exp(-t / 0.18) * 0.24 + Math.sin(TAU * 1760 * t) * Math.exp(-t / 0.11) * 0.12 },
  success: { seconds: 0.75, gain: 0.5, render: (t) => {
    const notes = [[523.25, 0], [659.25, 0.13], [783.99, 0.26]];
    return notes.reduce((sum, [frequency, start]) => start > t ? sum : sum + Math.sin(TAU * frequency * (t - start)) * Math.exp(-(t - start) / 0.22) * 0.36, 0);
  } },
  whoosh: { seconds: 0.42, gain: 0.3, render: (t, noise) => {
    const envelope = Math.sin(Math.PI * clamp(t / 0.42, 0, 1)) ** 2;
    return noise() * envelope * 0.5;
  } },
  pen: { seconds: 0.12, gain: 0.28, render: (t, noise) => {
    const envelope = Math.sin(Math.PI * clamp(t / 0.12, 0, 1)) ** 1.4;
    return noise() * envelope * 0.45;
  } },
  hmm: { seconds: 0.55, gain: 0.3, render: (t) => {
    const frequency = 233 - 40 * clamp(t / 0.55, 0, 1);
    return Math.sin(TAU * frequency * t) * Math.exp(-t / 0.24) * 0.45;
  } },
};

export const FAIR_SFX_NAMES = Object.keys(SFX_RECIPES);

export function fairSfx(name, sampleRate = FAIR_SAMPLE_RATE) {
  const recipe = SFX_RECIPES[name];
  if (!recipe) throw new Error(`Unknown sound effect: ${name}`);
  const samples = new Float32Array(Math.max(1, Math.round(recipe.seconds * sampleRate)));
  const noise = seeded(`fair-sfx:${name}`);
  for (let index = 0; index < samples.length; index++) samples[index] = recipe.render(index / sampleRate, noise) * recipe.gain;
  return samples;
}

// A beat grid is only used to place sounds, never to move a teaching reveal:
// narration stays word-locked, transitions get rhythm.
export function fairBeatSeconds(bpm = FAIR_DEFAULT_BPM) {
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 180) throw new Error('Music tempo must be between 40 and 180 BPM.');
  return 60 / bpm;
}

export function fairSnapToBeat(seconds, bpm = FAIR_DEFAULT_BPM, division = 2, maxShift = 0.12) {
  const step = fairBeatSeconds(bpm) / division, snapped = Math.round(seconds / step) * step;
  return Math.abs(snapped - seconds) <= maxShift ? Number(snapped.toFixed(4)) : seconds;
}

// Sound effects are derived from the composed lesson, not from wall-clock: a
// question ticks when its pause opens, the answer chimes when its reveal lands.
export function fairSfxPlan({ scenes = [], cuts = [], bpm = FAIR_DEFAULT_BPM, extra = [] } = {}) {
  const events = [];
  for (const cut of cuts) if (cut > 0.05) events.push({ name: 'whoosh', at: fairSnapToBeat(cut, bpm, 2), gain: 1 });
  for (const scene of scenes) {
    const speechSeconds = scene.track?.durationSeconds ?? Math.max(0, scene.duration - (scene.pauseSeconds ?? 0) - 0.7);
    if (scene.beat === 'question' && (scene.pauseSeconds ?? 0) > 0) {
      const pauseStart = scene.speechStart + speechSeconds;
      events.push({ name: 'tick', at: pauseStart, gain: 1 });
      events.push({ name: 'chime', at: pauseStart + (scene.pauseSeconds ?? 0), gain: 0.8 });
    }
    if (scene.beat === 'answer') events.push({ name: 'chime', at: scene.speechStart + speechSeconds * 0.55, gain: 0.9 });
    if (scene.beat === 'misconception') events.push({ name: 'hmm', at: scene.speechStart + speechSeconds * 0.5, gain: 0.9 });
    if (scene.beat === 'recap') events.push({ name: 'success', at: scene.speechStart + speechSeconds * 0.5, gain: 0.8 });
    if (scene.beat === 'example') events.push({ name: 'pen', at: scene.speechStart + speechSeconds * 0.2, gain: 1 });
  }
  // Cues emitted by the renderer itself (a cut, a stamp, a chime) land exactly on
  // the frame they belong to, so sound and transformation cannot drift apart.
  for (const cue of extra) if (Number.isFinite(cue?.at)) events.push({ name: cue.name, at: cue.at, gain: cue.gain ?? 1 });
  return events.sort((left, right) => left.at - right.at);
}

// All effects for one lesson, mixed into a single mono track at their exact
// timestamps. One input to ffmpeg instead of one input per sound.
export function fairSfxWav(events, durationSeconds, sampleRate = FAIR_SAMPLE_RATE) {
  const total = Math.max(1, Math.ceil((durationSeconds + 0.25) * sampleRate));
  const samples = new Float32Array(total);
  for (const event of events) {
    const source = fairSfx(event.name, sampleRate), offset = Math.round(event.at * sampleRate);
    for (let index = 0; index < source.length && offset + index < total; index++) {
      samples[offset + index] += source[index] * (event.gain ?? 1);
    }
  }
  return fairWav(samples, sampleRate);
}

const midiToFrequency = note => 440 * 2 ** ((note - 69) / 12);

// A deliberately sparse bed: slow warm pad, one soft pulse per beat, no melody.
// It is a placeholder for a licensed track, but it is deterministic and it sits
// far enough behind the voice to be usable in review.
export function fairSynthBed({ durationSeconds, bpm = FAIR_DEFAULT_BPM, mood = 'focus', sampleRate = FAIR_SAMPLE_RATE }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Bed duration must be positive.');
  const total = Math.ceil(durationSeconds * sampleRate);
  const samples = new Float32Array(total);
  const beat = fairBeatSeconds(bpm);
  const progression = mood === 'celebrate'
    ? [[60, 64, 67, 71], [59, 62, 66, 69], [57, 60, 64, 67], [55, 59, 62, 65]]
    : [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 71], [55, 59, 62, 65]];
  const barsPerChord = 2, beatsPerChord = barsPerChord * 4, chordSeconds = beatsPerChord * beat;
  const noise = seeded(`fair-bed:${mood}:${bpm}`);
  for (let index = 0; index < total; index++) {
    const t = index / sampleRate;
    const chordIndex = Math.floor(t / chordSeconds) % progression.length;
    const local = t % chordSeconds;
    const attack = Math.min(1, local / (chordSeconds * 0.35));
    const release = Math.min(1, (chordSeconds - local) / (chordSeconds * 0.3));
    const envelope = attack * release;
    let pad = 0;
    for (const note of progression[chordIndex]) {
      for (const [shift, gain] of [[12, 0.5], [24, 0.16]]) {
        const frequency = midiToFrequency(note + shift);
        pad += Math.sin(TAU * frequency * t + shift * 0.7) * gain + Math.sin(TAU * frequency * 1.003 * t) * gain * 0.4;
      }
    }
    const beatPhase = (t % beat) / beat;
    const pulse = Math.sin(TAU * 55 * (t % beat)) * Math.exp(-(t % beat) / 0.09) * 0.16;
    const sparkle = beatPhase < 0.02 ? noise() * 0.01 : 0;
    samples[index] = (pad * 0.055 * envelope + pulse * 0.5 + sparkle) * (mood === 'focus' ? 0.85 : 1);
  }
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  for (let index = 0; index < total; index++) samples[index] = samples[index] / peak * 0.55;
  return fairWav(samples, sampleRate);
}

export async function fairMusicLibrary(root) {
  try { return JSON.parse(await readFile(join(root, FAIR_MUSIC_MANIFEST), 'utf8')); } catch { return { tracks: [] }; }
}

export function fairSelectBed(library, mood = 'focus') {
  const tracks = (library?.tracks ?? []).filter(track => track?.file && track?.licence);
  const exact = tracks.find(track => track.mood === mood) ?? tracks.find(track => track.mood === 'focus') ?? tracks[0];
  return exact ?? null;
}

// Prepare one bed WAV of the exact lesson length. A licensed track is converted
// and looped; otherwise the placeholder is synthesised and labelled as such.
export async function fairPrepareBed({ directory, library, mood = 'focus', durationSeconds, bpm = FAIR_DEFAULT_BPM, root = process.cwd(), env = process.env, signal } = {}) {
  const output = join(directory, 'audio', 'bed.wav');
  await mkdir(dirname(output), { recursive: true });
  const entry = fairSelectBed(library, mood);
  if (entry) {
    const source = join(root, entry.file);
    await stat(source);
    // -stream_loop keeps a short cue under a long lesson; atrim fixes the length.
    await fairCommand(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1',
      '-i', source, '-af', `atrim=0:${(durationSeconds + 0.5).toFixed(3)},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, durationSeconds - 1).toFixed(3)}:d=1`,
      '-ar', String(FAIR_SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', output], { env, signal, timeoutMs: 120_000 });
    return { path: output, source: 'library', entry, sha256: await fairFileHash(output), bpm: entry.bpm ?? bpm, mood };
  }
  const buffer = fairSynthBed({ durationSeconds: durationSeconds + 0.5, bpm, mood });
  await writeFile(output, buffer);
  return { path: output, source: 'synth', entry: { title: 'Placeholder pad (synthesised)', licence: 'original — generated locally', bpm, mood }, sha256: await fairFileHash(output), bpm, mood };
}

// One graph: voice -> normalise, bed -> thin during pauses -> duck under voice,
// effects on top, limiter, single loudness target. The graph is returned so the
// quality report can record exactly how the audio was made.
export function fairMixGraph({ durationSeconds, pauses = [], bedGain = FAIR_BED_GAIN, pauseGain = FAIR_PAUSE_BED_GAIN, sfxGain = FAIR_SFX_GAIN }) {
  const automation = pauses
    .filter(pause => Number.isFinite(pause.start) && Number.isFinite(pause.end) && pause.end > pause.start)
    .map(pause => `between(t,${pause.start.toFixed(3)},${pause.end.toFixed(3)})`)
    .join('+') || '0';
  return [
    '[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,volume=1[voice]',
    `[1:a]aformat=sample_fmts=fltp:channel_layouts=mono,atrim=0:${(durationSeconds + 0.5).toFixed(3)},asetpts=N/SR/TB,volume='${bedGain.toFixed(3)}*if(${automation},${pauseGain.toFixed(3)},1)':eval=frame[bed]`,
    '[bed][voice]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[bedduck]',
    `[2:a]aformat=sample_fmts=fltp:channel_layouts=mono,volume=${sfxGain.toFixed(2)}[sfx]`,
    '[voice][bedduck][sfx]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
  ].join(';');
}

export async function fairMixLesson({ videoFile, outputFile, bedFile, sfxFile, durationSeconds, pauses = [], env = process.env, signal, onProgress = () => {} }) {
  await onProgress({ stage: 'audio', progress: 96, message: 'Mixing the music bed, teaching sounds and narration.' });
  const graph = fairMixGraph({ durationSeconds, pauses });
  await fairCommand(env.FAIR_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', videoFile, '-i', bedFile, '-i', sfxFile,
    '-filter_complex', graph, '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', outputFile],
  { env, signal, timeoutMs: 15 * 60_000 });
  return { graph };
}

export async function fairWriteAudioReport(file, report) { await fairWriteJson(file, report); }
