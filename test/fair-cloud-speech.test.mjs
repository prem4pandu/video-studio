import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fairCloudSpeech, fairPcmWav, fairSpeechText } from '../src/fair-cloud-speech.mjs';
import { fairAudioEnvelope, fairVoiceConfig } from '../src/fair-voice.mjs';

const voice = { model: 'gpt-realtime-2.1-mini', voice: 'marin', instructions: 'Read the reviewed script verbatim.' };
const script = 'Five tens make fifty.';
const env = { OPENAI_API_KEY: 'unit-test-placeholder-not-a-real-key' };

// This transport never opens a network connection. All responses are explicit test fixtures.
function session(text = script, options = {}) {
  let socket;
  class TestSocket extends EventEmitter {
    constructor(url, config) {
      super(); this.url = url; this.config = config; this.sent = []; this.terminations = 0; socket = this;
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    terminate() { this.terminations++; this.emit('close'); }
    event(value) { this.emit('message', Buffer.from(JSON.stringify(value))); }
  }
  const promise = fairCloudSpeech(text, voice, { env, ...options, Socket: TestSocket });
  return { promise, socket };
}
function audio(socket, pcm = Buffer.from([0, 20, 0, 30])) {
  socket.event({ type: 'response.output_audio.delta', delta: pcm.toString('base64') });
}
function complete(socket, transcript = script) {
  socket.event({ type: 'response.output_audio_transcript.done', transcript });
  socket.event({ type: 'response.done', response: { status: 'completed', usage: { output_tokens: 4 } } });
}

test('paid speech waits for session configuration, sends one response request, and assembles ordered PCM chunks', async () => {
  const { socket, promise } = session();
  assert.match(socket.url, /^wss:\/\/api\.openai\.com\/v1\/realtime\?model=gpt-realtime-2\.1-mini$/);
  assert.equal(socket.config.headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
  socket.emit('open');
  assert.equal(socket.sent.length, 1);
  const update = socket.sent[0];
  assert.equal(update.type, 'session.update');
  assert.deepEqual(update.session.output_modalities, ['audio']);
  assert.equal(update.session.audio.input.turn_detection, null);
  assert.deepEqual(update.session.audio.output.format, { type: 'audio/pcm', rate: 24000 });
  assert.equal(update.session.audio.output.voice, voice.voice);
  socket.event({ type: 'session.created' });
  assert.equal(socket.sent.length, 1);
  socket.event({ type: 'session.updated' });
  socket.event({ type: 'session.updated' });
  assert.deepEqual(socket.sent.map(event => event.type), ['session.update', 'conversation.item.create', 'response.create']);
  assert.equal(socket.sent[1].item.role, 'user');
  assert.equal(socket.sent[1].item.content[0].type, 'input_text');
  assert.ok(socket.sent[1].item.content[0].text.endsWith(script));
  const first = Buffer.from([0, 20, 0]), second = Buffer.from([30, 0, 40]);
  audio(socket, first); audio(socket, second);
  complete(socket);
  const result = await promise;
  assert.deepEqual(result.wav.subarray(44), Buffer.concat([first, second]));
  assert.equal(result.wav.readUInt32LE(24), 24000);
  assert.equal(result.wav.readUInt16LE(22), 1);
  assert.equal(result.wav.readUInt16LE(34), 16);
  assert.equal(result.wav.readUInt32LE(40), 6);
  assert.equal(result.transcript, script);
  assert.deepEqual(result.usage, { output_tokens: 4 });
  assert.equal(socket.terminations, 1);
  socket.emit('error', new Error('Late fixture transport error'));
  assert.equal(socket.terminations, 1);
});

test('transcript verification tolerates punctuation but rejects changed teaching words or absent transcript', async () => {
  const allowed = session("Let's count five tens.");
  audio(allowed.socket); complete(allowed.socket, 'LET’S count five tens!');
  assert.equal((await allowed.promise).transcript, 'LET’S count five tens!');
  for (const transcript of ['Five tens make fifteen.', 'Here is your lesson. Five tens make fifty.', '']) {
    const { socket, promise } = session();
    audio(socket); complete(socket, transcript);
    await assert.rejects(promise, /changed the approved script/);
    assert.equal(socket.terminations, 1);
  }
});

test('speech comparison preserves decimal digits while accepting equivalent spoken numbers', async () => {
  assert.equal(fairSpeechText('The value is 0.05.'), fairSpeechText('The value is zero point zero five.'));
  assert.equal(fairSpeechText('There are 1,205 counters.'), fairSpeechText('There are one thousand two hundred and five counters.'));
  assert.notEqual(fairSpeechText('The value is 0.05.'), fairSpeechText('The value is zero point five.'));
  assert.notEqual(fairSpeechText('There are 15 counters.'), fairSpeechText('There are fifty counters.'));
  const numeric = session('Five tens make 50.');
  audio(numeric.socket); complete(numeric.socket, 'Five tens make fifty.');
  assert.equal((await numeric.promise).transcript, 'Five tens make fifty.');
});

test('speech comparison preserves signs and distinguishes a comma-separated list from a grouped number', async () => {
  for (const [numeric, spoken] of [['-5', 'minus five'], ['−0.05', 'minus zero point zero five'], ['+5', 'plus five'], ['1,234,567', 'one million two hundred and thirty four thousand five hundred and sixty seven']]) {
    assert.equal(fairSpeechText(`The value is ${numeric}.`), fairSpeechText(`The value is ${spoken}.`));
  }
  assert.notEqual(fairSpeechText('The value is -5.'), fairSpeechText('The value is 5.'));
  assert.notEqual(fairSpeechText('Count 1,2.'), fairSpeechText('Count 12.'));
  assert.equal(fairSpeechText('Count 1,2.'), fairSpeechText('Count one, two.'));
  const changed = session('The temperature is -5 degrees.');
  audio(changed.socket); complete(changed.socket, 'The temperature is five degrees.');
  await assert.rejects(changed.promise, /changed the approved script/);
});

test('provider errors and unsuccessful response statuses fail without returning partial audio', async () => {
  for (const status of ['failed', 'cancelled', 'incomplete']) {
    const { socket, promise } = session();
    audio(socket);
    socket.event({ type: 'response.done', response: { status } });
    await assert.rejects(promise, /did not complete/);
    assert.equal(socket.terminations, 1);
  }
  const { socket, promise } = session();
  socket.event({ type: 'error', error: { code: 'insufficient_quota', message: 'Provider fixture detail' } });
  await assert.rejects(promise, /insufficient_quota/);
  assert.equal(socket.terminations, 1);
});

test('malformed events, empty audio, and odd-length PCM fail closed', async () => {
  const malformed = session();
  malformed.socket.emit('message', Buffer.from('{not json'));
  await assert.rejects(malformed.promise, /invalid response/);
  const empty = session();
  complete(empty.socket);
  await assert.rejects(empty.promise, /invalid (response|PCM)/);
  const odd = session();
  audio(odd.socket, Buffer.from([1, 2, 3])); complete(odd.socket);
  await assert.rejects(odd.promise, /invalid (response|PCM)/);
});

test('socket close and transport error settle promptly and terminate once', async () => {
  const closed = session();
  audio(closed.socket); closed.socket.emit('close');
  await assert.rejects(closed.promise, /closed before completing/);
  assert.equal(closed.socket.terminations, 1);
  const failed = session();
  failed.socket.emit('error', new Error('Fixture socket failure'));
  await assert.rejects(failed.promise, /connection failed/);
  assert.equal(failed.socket.terminations, 1);
});

test('cancellation stops an active socket and pre-aborted or unconfigured requests never connect', async () => {
  const controller = new AbortController();
  const { socket, promise } = session(script, { signal: controller.signal });
  socket.emit('open'); audio(socket);
  controller.abort();
  await assert.rejects(promise, /cancelled/);
  assert.equal(socket.terminations, 1);
  complete(socket);
  assert.equal(socket.terminations, 1);
  let connections = 0;
  class NeverConnect { constructor() { connections++; throw new Error('Unexpected connection'); } }
  await assert.rejects(fairCloudSpeech(script, voice, { env: {}, Socket: NeverConnect }), /OPENAI_API_KEY/);
  await assert.rejects(fairCloudSpeech(script, voice, { env, signal: controller.signal, Socket: NeverConnect }), /cancelled/);
  assert.equal(connections, 0);
});

test('PCM WAV output is readable by narration verification and invalid PCM cannot be packaged', () => {
  const pcm = Buffer.alloc(4800);
  for (let offset = 0; offset < pcm.length; offset += 2) pcm.writeInt16LE(5000, offset);
  const wav = fairPcmWav(pcm), measured = fairAudioEnvelope(wav);
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(measured.durationSeconds, 0.1);
  assert.ok(measured.envelope.every(point => point.value > 0));
  assert.throws(() => fairPcmWav(Buffer.alloc(0)), /invalid PCM/);
  assert.throws(() => fairPcmWav(Buffer.alloc(1)), /invalid PCM/);
});

test('paid narration configuration uses the selected avatar voice without embedding credentials', () => {
  for (const [avatar, expected] of [['mira', 'marin'], ['leo', 'cedar'], ['orbit', 'coral']]) {
    const configured = fairVoiceConfig(env, { provider: 'openai', avatar });
    assert.equal(configured.provider, 'openai');
    assert.equal(configured.model, 'gpt-realtime-2.1-mini');
    assert.equal(configured.voice, expected);
    assert.ok(!JSON.stringify(configured).includes(env.OPENAI_API_KEY));
  }
  assert.equal(fairVoiceConfig({ ...env, FAIR_OPENAI_VOICE: 'cedar' }, { provider: 'openai', avatar: 'mira' }).voice, 'cedar');
});

test('local narration cannot inherit an implicit paid provider from server environment', () => {
  const configured = { ...env, FAIR_TTS_PROVIDER: 'openai' };
  assert.throws(() => fairVoiceConfig(configured, { provider: 'local' }), /Select OpenAI mode explicitly/);
  assert.throws(() => fairVoiceConfig(configured), /Select OpenAI mode explicitly/);
  assert.equal(fairVoiceConfig(configured, { provider: 'openai', avatar: 'mira' }).provider, 'openai');
  assert.equal(fairVoiceConfig({ FAIR_TTS_PROVIDER: 'kokoro' }, { provider: 'local' }).provider, 'kokoro');
});
