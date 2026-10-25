import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand, fairFileHash, fairHash, fairReadJson, fairWriteJson } from './fair-utils.mjs';
import { fairQwenPaths } from './fair-qwen-voice.mjs';

const script = fileURLToPath(new URL('../scripts/fair-align-speech.py', import.meta.url));
const token = value => value.toLowerCase().replaceAll('’', "'").replace(/[^\p{L}\p{N}']/gu, '');

export function fairValidateAlignment(scriptText, items, durationSeconds) {
  const words = scriptText.trim().split(/\s+/u);
  if (!Array.isArray(items) || items.length !== words.length) throw new Error('Forced alignment omitted or added narration words.');
  let previousEnd = 0;
  return items.map((item, index) => {
    const { startSeconds, endSeconds } = item;
    if (typeof item.text !== 'string' || token(item.text) !== token(words[index])) throw new Error(`Forced alignment word mismatch at ${index + 1}.`);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < previousEnd - .03 || startSeconds < 0 || endSeconds <= startSeconds || endSeconds > durationSeconds + .03) throw new Error(`Invalid forced-alignment timestamps at word ${index + 1}.`);
    previousEnd = endSeconds;
    return { text: words[index], startSeconds, endSeconds };
  });
}

// Alignment locates approved words; it does not independently transcribe or verify speech.
export async function fairAlignSpeech(text, audioFile, track, { env = process.env, signal, command = fairCommand } = {}) {
  const modelDir = env.FAIR_ALIGNMENT_MODEL_DIR;
  if (!modelDir) return track;
  const python = env.FAIR_ALIGNMENT_PYTHON || fairQwenPaths(env).python;
  const weights = await stat(join(modelDir, 'model.safetensors'));
  const fingerprint = fairHash({ revision: 2, audio: track.sha256, text, modelDir,
    config: await fairFileHash(join(modelDir, 'config.json')), weights: { bytes: weights.size, modified: weights.mtimeMs } });
  const cacheFile = `${audioFile}.alignment.json`;
  let saved;
  try { saved = await fairReadJson(cacheFile); } catch {}
  if (saved?.fingerprint !== fingerprint) {
    const requestFile = `${audioFile}.alignment-request.json`, outputFile = `${audioFile}.alignment-output.json`;
    await fairWriteJson(requestFile, { modelDir, audioFile, phrases: track.phrases, text, outputFile });
    await command(python, [script, requestFile], { env: { ...env, HF_HUB_OFFLINE: '1' }, signal, timeoutMs: 180_000 });
    const result = await fairReadJson(outputFile);
    saved = { fingerprint, words: fairValidateAlignment(text, result.words, track.durationSeconds), model: result.model, revision: result.revision };
    await fairWriteJson(cacheFile, saved);
  }
  return { ...track, words: fairValidateAlignment(text, saved.words, track.durationSeconds),
    wordTimingSource: 'forced-alignment', alignment: { model: saved.model, revision: saved.revision, fingerprint } };
}
