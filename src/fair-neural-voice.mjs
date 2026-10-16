import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand } from './fair-utils.mjs';
import { fairSpeechText } from './fair-cloud-speech.mjs';

const fairHome = fileURLToPath(new URL('../.fair-neural/', import.meta.url));
export function fairNeuralPaths(env = process.env) {
  return { python: env.FAIR_KOKORO_PYTHON || join(fairHome, 'venv/bin/python'), model: env.FAIR_KOKORO_MODEL || join(fairHome, 'kokoro-v1.0.onnx'), voices: env.FAIR_KOKORO_VOICES || join(fairHome, 'voices-v1.0.bin') };
}
export function fairPiperPaths(env = process.env) {
  const model = env.FAIR_PIPER_MODEL || join(fairHome, 'piper/fair-indian-english.onnx');
  return { python: env.FAIR_PIPER_PYTHON || join(fairHome, 'venv/bin/python'), model, config: env.FAIR_PIPER_CONFIG || `${model}.json` };
}

export async function fairPiperSpeech(text, voice, source, { env = process.env, signal } = {}) {
  const paths = fairPiperPaths(env);
  try { await Promise.all(Object.values(paths).map(path => access(path))); }
  catch { throw new Error('Indian English neural narration is not installed. Configure FAIR_PIPER_PYTHON, FAIR_PIPER_MODEL and FAIR_PIPER_CONFIG.'); }
  const requestFile = `${source}.request.json`, timingFile = `${source}.timing.json`;
  await writeFile(requestFile, JSON.stringify({ ...paths, phrases: fairSpeechPhrases(text), lengthScale: voice.lengthScale, volume: voice.volume, output: source, timing: timingFile }));
  const python = `import json,sys,numpy as np,soundfile as sf
from piper import PiperVoice,SynthesisConfig
r=json.load(open(sys.argv[1]))
voice=PiperVoice.load(r['model'],config_path=r['config'])
settings=SynthesisConfig(length_scale=r['lengthScale'],volume=r['volume'])
parts=[]; timings=[]; count=0; rate=voice.config.sample_rate
for text in r['phrases']:
 chunks=list(voice.synthesize(text,syn_config=settings))
 if not chunks or any(c.sample_rate!=rate for c in chunks): raise ValueError('Invalid Piper audio')
 a=np.concatenate([c.audio_float_array for c in chunks])
 if not len(a): raise ValueError('Empty Piper audio')
 timings.append({'text':text,'startSeconds':count/rate,'endSeconds':(count+len(a))/rate})
 parts.append(a); count+=len(a)
sf.write(r['output'],np.concatenate(parts),rate,format='WAV',subtype='PCM_16')
json.dump(timings,open(r['timing'],'w'))
`;
  await fairCommand(paths.python, ['-c', python, requestFile], { env, signal, timeoutMs: 300_000 });
  const phrases = JSON.parse(await readFile(timingFile, 'utf8'));
  return { phrases, words: fairEstimatedWords(phrases), timingSource: 'phrase-measured', wordTimingSource: 'estimated' };
}

// Splitting only at sentence punctuation preserves decimal numbers and word order.
export function fairSpeechPhrases(text) {
  return text.trim().split(/(?<=[.!?;:])\s+/u).filter(Boolean).flatMap(sentence => {
    const parts = []; let part = '';
    for (const word of sentence.split(/\s+/u)) {
      if (part && part.length + 1 + word.length > 350) { parts.push(part); part = ''; }
      part += `${part ? ' ' : ''}${word}`;
    }
    if (part) parts.push(part);
    return parts;
  });
}
export function fairEstimatedWords(phrases) {
  return phrases.flatMap(phrase => {
    const words = phrase.text.match(/\S+/g) || [], weights = words.map(word => Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, '').length));
    const sum = weights.reduce((a, b) => a + b, 0); let elapsed = 0;
    return words.map((text, index) => { const startSeconds = phrase.startSeconds + elapsed / sum * (phrase.endSeconds - phrase.startSeconds); elapsed += weights[index]; return { text, startSeconds, endSeconds: phrase.startSeconds + elapsed / sum * (phrase.endSeconds - phrase.startSeconds) }; });
  });
}

// ONNX runs in an isolated local Python environment. Each sentence is synthesized
// separately, so phrase boundaries are measured; word positions are estimates.
export async function fairLocalNeuralSpeech(text, voice, source, { env = process.env, signal } = {}) {
  const paths = fairNeuralPaths(env);
  try { await Promise.all(Object.values(paths).map(path => access(path))); }
  catch { throw new Error('Local neural narration is not installed. Configure FAIR_KOKORO_PYTHON, FAIR_KOKORO_MODEL and FAIR_KOKORO_VOICES, or explicitly select a configured paid voice.'); }
  const requestFile = `${source}.request.json`, timingFile = `${source}.timing.json`;
  await writeFile(requestFile, JSON.stringify({ ...paths, phrases: fairSpeechPhrases(text), voice: voice.voice, speed: voice.speed, output: source, timing: timingFile }));
  const python = `import json,sys,numpy as np,soundfile as sf
from kokoro_onnx import Kokoro
r=json.load(open(sys.argv[1]))
k=Kokoro(r['model'],r['voices'])
lang='en-gb' if r['voice'].startswith('b') else 'en-us'
def bounded(text):
 phonemes=k.tokenizer.phonemize(text,lang)
 if len(phonemes)<=500: return [(text,phonemes)]
 words=text.split()
 if len(words)<2: raise ValueError('Narration word exceeds the neural model limit')
 mid=len(words)//2
 return bounded(' '.join(words[:mid]))+bounded(' '.join(words[mid:]))
units=[unit for phrase in r['phrases'] for unit in bounded(phrase)]
parts=[]; timings=[]; count=0; rate=24000
for index,(text,phonemes) in enumerate(units):
 a,sr=k.create(phonemes,voice=r['voice'],speed=r['speed'],is_phonemes=True)
 if sr!=rate or len(a)==0: raise ValueError('Invalid neural audio')
 timings.append({'text':text,'startSeconds':count/rate,'endSeconds':(count+len(a))/rate})
 parts.append(a); count+=len(a)
 if index<len(units)-1:
  pause=np.zeros(round(rate*(0.28 if text.endswith(('!','?')) else 0.2)))
  parts.append(pause); count+=len(pause)
sf.write(r['output'],np.concatenate(parts),rate,format='WAV',subtype='PCM_16')
json.dump(timings,open(r['timing'],'w'))
`;
  await fairCommand(paths.python, ['-c', python, requestFile], { env, signal, timeoutMs: 300_000 });
  const phrases = JSON.parse(await readFile(timingFile, 'utf8'));
  return { phrases, words: fairEstimatedWords(phrases), timingSource: 'phrase-measured', wordTimingSource: 'estimated' };
}

export function fairAlignedWords(alignment, script) {
  const characters = alignment?.characters, starts = alignment?.character_start_times_seconds, ends = alignment?.character_end_times_seconds;
  if (!Array.isArray(characters) || !characters.length || !Array.isArray(starts) || !Array.isArray(ends) || characters.length !== starts.length || starts.length !== ends.length) throw new Error('Premium speech returned invalid alignment.');
  let previous = 0;
  for (let i = 0; i < characters.length; i++) {
    if (typeof characters[i] !== 'string' || !Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < previous || ends[i] < starts[i] || ends[i] > 600) throw new Error('Premium speech returned invalid alignment.');
    previous = starts[i];
  }
  if (fairSpeechText(characters.join('')) !== fairSpeechText(script)) throw new Error('Premium speech changed the approved script.');
  const words = []; let current;
  characters.forEach((character, index) => {
    if (/^\s+$/.test(character)) { if (current) words.push(current); current = undefined; }
    else if (current) { current.text += character; current.endSeconds = ends[index]; }
    else current = { text: character, startSeconds: starts[index], endSeconds: ends[index] };
  });
  if (current) words.push(current);
  return words;
}

export async function fairElevenLabsSpeech(script, voice, { env = process.env, signal, fetchImpl = fetch } = {}) {
  if (!env.ELEVENLABS_API_KEY) throw new Error('Set ELEVENLABS_API_KEY on the server to use ElevenLabs narration.');
  if (!voice.voice) throw new Error('Set FAIR_ELEVENLABS_VOICE_ID to your chosen premium voice.');
  if (signal?.aborted) throw new Error('Generation cancelled.');
  const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: script, model_id: voice.model, voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
    signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(120_000)]),
  });
  if (!response.ok) throw new Error(`ElevenLabs speech failed (HTTP ${response.status}). Check the voice, credentials and account limits.`);
  const raw = await response.text();
  if (raw.length > 70_000_000) throw new Error('Premium speech exceeds the per-scene response limit.');
  const result = JSON.parse(raw);
  if (typeof result.audio_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio_base64)) throw new Error('Premium speech returned invalid audio.');
  const audio = Buffer.from(result.audio_base64, 'base64');
  if (!audio.length || audio.length > 50_000_000) throw new Error('Premium speech returned invalid audio.');
  // Original-text alignment preserves narration word indices used by animation cues.
  const words = fairAlignedWords(result.alignment || result.normalized_alignment, script), phrases = [];
  let group = [];
  for (const word of words) { group.push(word); if (/[.!?]$/.test(word.text)) { phrases.push({ text: group.map(item => item.text).join(' '), startSeconds: group[0].startSeconds, endSeconds: word.endSeconds }); group = []; } }
  if (group.length) phrases.push({ text: group.map(item => item.text).join(' '), startSeconds: group[0].startSeconds, endSeconds: group.at(-1).endSeconds });
  return { audio, words, phrases, timingSource: 'provider-alignment', wordTimingSource: 'provider-alignment' };
}
