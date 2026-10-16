import test from 'node:test';
import assert from 'node:assert/strict';
import { fairAlignedWords, fairElevenLabsSpeech, fairEstimatedWords, fairLocalNeuralSpeech, fairSpeechPhrases, fairPiperPaths, fairPiperSpeech } from '../src/fair-neural-voice.mjs';
import { fairVoiceConfig } from '../src/fair-voice.mjs';

const script = 'Ten ones. One ten!';
const alignment = text => ({ characters: [...text], character_start_times_seconds: [...text].map((_, index) => index * 0.1), character_end_times_seconds: [...text].map((_, index) => (index + 1) * 0.1) });
const voice = { voice: 'fixture-voice-id', model: 'eleven_multilingual_v2' };
const env = { ELEVENLABS_API_KEY: 'test-placeholder' };

test('neural narration is default, premium selection is explicit, and configuration contains no key', () => {
  const local = fairVoiceConfig({}, { provider: 'local' });
  assert.equal(local.provider, 'qwentts'); assert.equal(local.voice, 'teacher'); assert.equal(local.modelId, 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit');
  assert.equal(local.url, undefined); assert.ok(local.python.endsWith('/qwen-venv/bin/python'));
  const piper = fairVoiceConfig({}, { provider: 'local', voiceProvider: 'piper' });
  assert.equal(piper.provider, 'piper'); assert.equal(piper.voice, 'en_IN-spicor'); assert.equal(piper.lengthScale, 1.08);
  assert.equal(fairVoiceConfig({}, { provider: 'openai', voiceProvider: 'kokoro' }).provider, 'kokoro');
  const premium = fairVoiceConfig(env, { provider: 'local', voiceProvider: 'elevenlabs' });
  assert.equal(premium.provider, 'elevenlabs'); assert.ok(!JSON.stringify(premium).includes(env.ELEVENLABS_API_KEY));
  assert.throws(() => fairVoiceConfig({ FAIR_TTS_PROVIDER: 'elevenlabs' }, { provider: 'local' }), /explicitly/);
  assert.throws(() => fairVoiceConfig({ FAIR_KOKORO_SPEED: 'NaN' }, { voiceProvider: 'kokoro' }), /speed/i);
  assert.throws(() => fairVoiceConfig({}, { voiceProvider: 'imaginary' }), /provider/);
});

test('phrase splitting preserves decimals, signed numbers and long-script word order', () => {
  const text = 'Look at 0.05. Now compare -5 and +5! Is 1,000 larger?';
  assert.deepEqual(fairSpeechPhrases(text), ['Look at 0.05.', 'Now compare -5 and +5!', 'Is 1,000 larger?']);
  const long = Array.from({ length: 300 }, (_, index) => `word${index}`).join(' ');
  const parts = fairSpeechPhrases(long);
  assert.equal(parts.join(' '), long); assert.ok(parts.every(part => part.length <= 350));
  assert.deepEqual(fairSpeechPhrases('  '), []);
});

test('estimated words retain phrase boundaries and do not fill measured inter-phrase pauses', () => {
  const words = fairEstimatedWords([{ text: 'Ten ones.', startSeconds: 0.2, endSeconds: 1 }, { text: 'One ten!', startSeconds: 1.4, endSeconds: 2 }]);
  assert.deepEqual(words.map(word => word.text), ['Ten', 'ones.', 'One', 'ten!']);
  assert.equal(words[0].startSeconds, 0.2); assert.equal(words[1].endSeconds, 1);
  assert.equal(words[2].startSeconds, 1.4); assert.equal(words[3].endSeconds, 2);
});

test('premium character alignment builds words and fails on altered script or malformed timing', () => {
  const words = fairAlignedWords(alignment(script), script);
  assert.deepEqual(words.map(word => word.text), ['Ten', 'ones.', 'One', 'ten!']);
  assert.equal(words[0].startSeconds, 0); assert.equal(words.at(-1).endSeconds, script.length * 0.1);
  assert.throws(() => fairAlignedWords(alignment('Ten ones. One hundred!'), script), /changed/);
  for (const modify of [value => value.characters.pop(), value => value.character_start_times_seconds[3] = -1, value => value.character_end_times_seconds[2] = NaN, value => value.character_end_times_seconds[1] = 601]) {
    const invalid = alignment(script); modify(invalid); assert.throws(() => fairAlignedWords(invalid, script), /invalid alignment/);
  }
});

test('ElevenLabs request contract returns original encoded audio and provider alignment with no network', async () => {
  let request;
  const result = await fairElevenLabsSpeech(script, voice, { env, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, text: async () => JSON.stringify({ audio_base64: Buffer.from('explicit fixture, not playable audio').toString('base64'), normalized_alignment: alignment(script) }) };
  } });
  assert.match(request.url, /fixture-voice-id\/with-timestamps\?output_format=mp3_44100_128$/);
  assert.equal(request.options.headers['xi-api-key'], env.ELEVENLABS_API_KEY);
  assert.equal(JSON.parse(request.options.body).text, script);
  assert.equal(JSON.parse(request.options.body).model_id, voice.model);
  assert.equal(result.audio.toString(), 'explicit fixture, not playable audio');
  assert.equal(result.timingSource, 'provider-alignment'); assert.equal(result.wordTimingSource, 'provider-alignment');
  assert.deepEqual(result.phrases.map(phrase => phrase.text), ['Ten ones.', 'One ten!']);
});

test('premium provider errors, missing credentials, malformed audio, and cancellation fail without fallback', async () => {
  let calls = 0;
  const neverFetch = async () => { calls++; throw new Error('Unexpected request'); };
  await assert.rejects(fairElevenLabsSpeech(script, voice, { env: {}, fetchImpl: neverFetch }), /ELEVENLABS_API_KEY/);
  await assert.rejects(fairElevenLabsSpeech(script, { voice: '' }, { env, fetchImpl: neverFetch }), /VOICE_ID/);
  await assert.rejects(fairElevenLabsSpeech(script, voice, { env, fetchImpl: neverFetch, signal: AbortSignal.abort() }), /cancelled/);
  assert.equal(calls, 0);
  await assert.rejects(fairElevenLabsSpeech(script, voice, { env, fetchImpl: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
  await assert.rejects(fairElevenLabsSpeech(script, voice, { env, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ audio_base64: '!!!', alignment: alignment(script) }) }) }), /invalid audio/);
  const controller = new AbortController();
  const pending = fairElevenLabsSpeech(script, voice, { env, signal: controller.signal, fetchImpl: async (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Fixture cancelled')), { once: true })) });
  controller.abort(); await assert.rejects(pending, /cancelled/);
});

test('missing local neural installation fails explicitly without invoking a system or paid voice', async () => {
  await assert.rejects(fairLocalNeuralSpeech(script, { voice: 'bf_emma', speed: 0.95 }, '/unused', { env: { FAIR_KOKORO_PYTHON: '/nonexistent-fair-python', FAIR_KOKORO_MODEL: '/nonexistent-fair-model', FAIR_KOKORO_VOICES: '/nonexistent-fair-voices' } }), /not installed/);
});

test('Indian English uses its separate Piper model and explicit provider, never relabels Kokoro Hindi', () => {
  const indian = fairVoiceConfig({}, { provider: 'local', voiceProvider: 'piper' });
  assert.equal(indian.provider, 'piper'); assert.equal(indian.voice, 'en_IN-spicor');
  assert.equal(indian.modelId, 'navgurukul-ai-labs/text-to-speech-en-IN-piper');
  assert.equal(indian.lengthScale, 1.08); assert.ok(indian.config.endsWith('.onnx.json'));
  assert.equal(fairVoiceConfig({ FAIR_TTS_PROVIDER: 'piper' }, { provider: 'local' }).provider, 'piper');
  assert.throws(() => fairVoiceConfig({ FAIR_PIPER_LENGTH_SCALE: 'NaN' }, { voiceProvider: 'piper' }), /LENGTH_SCALE/);
  assert.deepEqual(fairPiperPaths({ FAIR_PIPER_PYTHON: '/python', FAIR_PIPER_MODEL: '/model', FAIR_PIPER_CONFIG: '/config' }), { python: '/python', model: '/model', config: '/config' });
});

test('uninstalled Indian English model fails without switching to another accent', async () => {
  await assert.rejects(fairPiperSpeech(script, { lengthScale: 1.08 }, '/unused', { env: { FAIR_PIPER_PYTHON: '/nonexistent-fair-python', FAIR_PIPER_MODEL: '/nonexistent-fair-piper-model', FAIR_PIPER_CONFIG: '/nonexistent-fair-piper-config' } }), /Indian English neural narration is not installed/);
});
