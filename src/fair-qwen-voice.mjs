import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand } from './fair-utils.mjs';
import { fairEstimatedWords, fairSpeechPhrases } from './fair-neural-voice.mjs';

const fairHome = fileURLToPath(new URL('../.fair-neural/', import.meta.url));
const voiceProfiles = fileURLToPath(new URL('../content/voices/', import.meta.url));

export function fairQwenPaths(env = process.env) {
  return {
    python: env.FAIR_QWEN_PYTHON || join(fairHome, 'qwen-venv/bin/python'),
    modelDir: env.FAIR_QWEN_MODEL_DIR || join(fairHome, 'qwen-voice-design-8bit'),
  };
}

// The canonical teacher voice is a designed synthetic voice described by
// content/voices/teacher.json, not a cloned person. Per-locale profiles can be
// added as sibling files and selected with FAIR_QWEN_PROFILE.
export async function fairQwenProfile(env = process.env) {
  const file = env.FAIR_QWEN_PROFILE || join(voiceProfiles, 'teacher.json');
  let profile;
  try { profile = JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new Error(`Teacher voice profile is missing: ${file}. Create content/voices/teacher.json.`); }
  if (typeof profile.instruct !== 'string' || profile.instruct.trim().length < 40 || profile.instruct.length > 2000) {
    throw new Error('Voice profile needs an instruct string of 40..2000 characters describing the speaker, not a script.');
  }
  const seed = Number(env.FAIR_QWEN_SEED || profile.seed);
  if (!Number.isInteger(seed) || seed < 0) throw new Error('Voice profile seed must be a non-negative integer.');
  return { id: profile.id || 'teacher', instruct: profile.instruct.trim(), seed };
}

// Qwen3-TTS VoiceDesign runs locally through MLX on Apple Silicon. Each phrase
// is synthesized separately with a re-seeded generator for a consistent speaker;
// phrase boundaries are measured, word positions are estimated.
export async function fairQwenSpeech(text, voice, source, { env = process.env, signal } = {}) {
  const paths = fairQwenPaths(env);
  try { await access(paths.python); await access(join(paths.modelDir, 'config.json')); }
  catch { throw new Error('Qwen3-TTS VoiceDesign is not installed. Run scripts/fair-setup-voice.mjs --check, or set FAIR_QWEN_PYTHON and FAIR_QWEN_MODEL_DIR.'); }
  const profile = await fairQwenProfile(env);
  const requestFile = `${source}.request.json`, timingFile = `${source}.timing.json`;
  await writeFile(requestFile, JSON.stringify({ ...paths, phrases: fairSpeechPhrases(text), instruct: profile.instruct, seed: profile.seed, output: source, timing: timingFile }));
  const python = `import json,sys,numpy as np,soundfile as sf
import mlx.core as mx
from mlx_audio.tts.utils import load_model
r=json.load(open(sys.argv[1]))
model=load_model(r['modelDir'])
parts=[];timings=[];count=0;rate=None
for index,text in enumerate(r['phrases']):
 mx.random.seed(r['seed'])
 results=list(model.generate_voice_design(text=text,instruct=r['instruct'],language='English',temperature=0.7,max_tokens=2048,verbose=False))
 if not results: raise ValueError('Empty Qwen speech for a phrase')
 sr=results[0].sample_rate
 if rate is None: rate=sr
 if sr!=rate: raise ValueError('Inconsistent Qwen sample rate')
 a=np.concatenate([np.asarray(x.audio).reshape(-1) for x in results])
 if not len(a) or not np.isfinite(a).all(): raise ValueError('Invalid Qwen audio')
 timings.append({'text':text,'startSeconds':count/rate,'endSeconds':(count+len(a))/rate})
 parts.append(a);count+=len(a)
 if index<len(r['phrases'])-1:
  pause=np.zeros(round(rate*0.22));parts.append(pause);count+=len(pause)
sf.write(r['output'],np.concatenate(parts),rate,format='WAV',subtype='PCM_16')
json.dump(timings,open(r['timing'],'w'))
`;
  await fairCommand(paths.python, ['-c', python, requestFile], { env, signal, timeoutMs: 600_000 });
  const phrases = JSON.parse(await readFile(timingFile, 'utf8'));
  return { phrases, words: fairEstimatedWords(phrases), timingSource: 'phrase-measured', wordTimingSource: 'estimated', voiceProfile: profile.id };
}
