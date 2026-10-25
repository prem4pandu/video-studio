import { fairCommand } from './utils.mjs';
import { fairWanReadiness } from './wan.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FAIR_OPEN_MODEL = process.env.FAIR_OPEN_MODEL || 'qwen2.5:7b';
const bundledManim = fileURLToPath(new URL('../.fair-open/venv/bin/python', import.meta.url));
export const fairManimPython = (env = process.env) => env.FAIR_MANIM_PYTHON || (existsSync(bundledManim) ? bundledManim : 'python3');

function localOrigin(value, name) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be a loopback HTTP origin for the open-source version. Use an SSH tunnel for another machine.`);
  }
  return url;
}

export function fairOpenEnvironment(env = process.env, brief = {}) {
  localOrigin(env.FAIR_OLLAMA_URL || 'http://127.0.0.1:11434', 'FAIR_OLLAMA_URL');
  if (brief.voiceProvider === 'kokoro' && env.FAIR_KOKORO_URL) {
    const endpoint = new URL(env.FAIR_KOKORO_URL);
    if (endpoint.pathname !== '/v1/audio/speech') throw new Error('FAIR_KOKORO_URL must end in /v1/audio/speech.');
    endpoint.pathname = '/';
    localOrigin(endpoint.href, 'FAIR_KOKORO_URL');
  }
  // Keep a paid or differently licensed classic review model out of this version.
  // Planner and critic may be configured separately; the critic defaults to the
  // planner for compatibility, but a distinct critic model is recommended.
  const model = brief.model || env.FAIR_OPEN_MODEL || FAIR_OPEN_MODEL;
  return { ...env, FAIR_MODEL: model, FAIR_REVIEW_MODEL: env.FAIR_OPEN_REVIEW_MODEL || model };
}

export async function fairOpenReadiness({ env = process.env, brief = {}, signal, fetchImpl = fetch, command = fairCommand, wanReadiness = fairWanReadiness } = {}) {
  try { env = fairOpenEnvironment(env, brief); }
  catch (error) { return { available: false, blockers: [error.message] }; }
  const checks = await Promise.allSettled([
    command(fairManimPython(env), ['-c', 'import manim; print(manim.__version__)'], { env, signal, timeoutMs: 10_000 }),
    command(env.FAIR_FFMPEG || 'ffmpeg', ['-version'], { env, signal, timeoutMs: 3000 }),
    command(env.FAIR_FFPROBE || 'ffprobe', ['-version'], { env, signal, timeoutMs: 3000 }),
    (async () => {
      const response = await fetchImpl(new URL('/api/tags', env.FAIR_OLLAMA_URL || 'http://127.0.0.1:11434'), {
        redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error('Ollama unavailable');
      const body = await response.json();
      for (const name of new Set([env.FAIR_MODEL, env.FAIR_REVIEW_MODEL])) {
        if (!body.models?.some(model => model.name === name)) throw new Error(`Install the configured local model: ollama pull ${name}.`);
      }
    })(),
    brief.footage === 'wan' ? wanReadiness({ env, signal, fetchImpl }) : Promise.resolve({ available: true }),
  ]);
  const messages = [
    'Install Manim in a Python environment and set FAIR_MANIM_PYTHON to that interpreter.',
    'Install FFmpeg or set FAIR_FFMPEG.',
    'Install ffprobe or set FAIR_FFPROBE.',
    `Start Ollama and install the configured planner and critic: ${[...new Set([env.FAIR_MODEL, env.FAIR_REVIEW_MODEL])].join(', ')}.`,
    'Start ComfyUI with the Wan2.2 models installed; see the open-source setup guide.',
  ];
  const blockers = checks.flatMap((result, index) => {
    if (result.status === 'rejected') return [index === 3 ? `${messages[index]} ${result.reason.message}` : messages[index]];
    if (index === 4 && !result.value.available) return [result.value.detail || messages[index]];
    return [];
  });
  return { available: blockers.length === 0, blockers };
}
