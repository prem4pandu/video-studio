import WebSocket from 'ws';

const FAIR_SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
function numberWords(value) {
  if (value < 20) return FAIR_SMALL[value];
  if (value < 100) return ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][Math.floor(value / 10)] + (value % 10 ? ` ${numberWords(value % 10)}` : '');
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [100, 'hundred']]) {
    if (value >= size) return `${numberWords(Math.floor(value / size))} ${name}${value % size ? ` ${numberWords(value % size)}` : ''}`;
  }
}

export function fairSpeechText(text) {
  return text.toLowerCase().replace(/(^|[^\p{L}\p{N}])([-−+])(?=\d)/gu, (_, prefix, sign) => `${prefix}${sign === '+' ? 'plus' : 'minus'} `).replace(/\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\b/g, token => {
    const [whole, decimal] = token.replaceAll(',', '').split('.');
    if (whole.length > 12) return token;
    const spoken = numberWords(Number(whole));
    return decimal ? `${spoken} point ${[...decimal].map(digit => FAIR_SMALL[Number(digit)]).join(' ')}` : spoken;
  }).replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(hundred|thousand|million|billion) and (?=(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b)/g, '$1 ').trim();
}

export function fairPcmWav(pcm) {
  if (!pcm.length || pcm.length % 2) throw new Error('Cloud speech returned invalid PCM audio.');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// A fresh session per scene prevents conversational context from changing the script.
export async function fairCloudSpeech(script, voice, { env = process.env, signal, Socket = WebSocket } = {}) {
  if (!env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY on the server to use paid narration.');
  if (signal?.aborted) throw new Error('Generation cancelled.');
  return new Promise((resolve, reject) => {
    const socket = new Socket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(voice.model)}`, {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, handshakeTimeout: 15000, maxPayload: 8_000_000,
    });
    const chunks = []; let bytes = 0, settled = false, started = false, transcript = '';
    const finish = (error, result) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      socket.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new Error('Generation cancelled.'));
    const timer = setTimeout(() => finish(new Error('Cloud narration timed out.')), 120000);
    signal?.addEventListener('abort', abort, { once: true });
    socket.on('open', () => socket.send(JSON.stringify({ type: 'session.update', session: {
      type: 'realtime', output_modalities: ['audio'], instructions: voice.instructions,
      audio: { input: { turn_detection: null }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: voice.voice } },
    } })));
    socket.on('error', () => finish(new Error('Cloud speech connection failed. Check network access and OPENAI_API_KEY.')));
    socket.on('close', () => finish(new Error('Cloud speech closed before completing narration.')));
    socket.on('message', data => {
      try {
        const event = JSON.parse(data.toString());
        if (event.type === 'error') return finish(new Error(`Cloud speech failed (${event.error?.code || 'provider error'}). Check model access and account limits.`));
        if (event.type === 'session.updated' && !started) {
          started = true;
          socket.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Read this script verbatim, without introduction or commentary:\n${script}` }] } }));
          socket.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['audio'] } }));
        }
        if (event.type === 'response.output_audio.delta') {
          const chunk = Buffer.from(event.delta, 'base64'); bytes += chunk.length;
          if (bytes > 50_000_000) return finish(new Error('Cloud speech exceeds the per-scene audio limit.'));
          chunks.push(chunk);
        }
        if (event.type === 'response.output_audio_transcript.done') transcript += event.transcript || '';
        if (event.type === 'response.done') {
          if (event.response?.status !== 'completed') return finish(new Error(`Cloud narration did not complete (${event.response?.status || 'unknown'}).`));
          // Reject word changes so captions and teaching claims stay attached to the reviewed script.
          if (!transcript || fairSpeechText(transcript) !== fairSpeechText(script)) return finish(new Error('Cloud voice changed the approved script. Retry narration or use local speech.'));
          finish(null, { wav: fairPcmWav(Buffer.concat(chunks)), transcript, usage: event.response.usage || null });
        }
      } catch { finish(new Error('Cloud speech returned an invalid response.')); }
    });
  });
}
