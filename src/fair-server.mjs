import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FairJobStore, fairJobArtifacts } from './fair-jobs.mjs';
import { FAIR_AVATARS, fairVoiceConfig } from './fair-voice.mjs';
import { fairNeuralPaths, fairPiperPaths } from './fair-neural-voice.mjs';
import { fairQwenPaths } from './fair-qwen-voice.mjs';
import { fairCurriculumCoverage, fairCurriculumIndex, fairFindTopic, fairLoadCurricula, fairTopicBrief } from './fair-curriculum.mjs';
import { fairCommand } from './fair-utils.mjs';
import { FAIR_PRICING } from './fair-pricing.mjs';
import { FAIR_OPEN_MODEL, fairOpenEnvironment, fairOpenReadiness } from './fair-open-config.mjs';
import { fairLmStudioModels } from './fair-lmstudio.mjs';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticFiles = new Map([['/', 'app/index.html'], ['/index.html', 'app/index.html'], ['/legacy.html', 'index.html'], ['/app/assets/studio.js', 'app/assets/studio.js'], ['/app/assets/studio.css', 'app/assets/studio.css'], ['/curriculum.html', 'curriculum.html'], ['/ui-templates.html', 'ui-templates.html'], ['/fair-studio.css', 'fair-studio.css'], ['/fair-curriculum.css', 'fair-curriculum.css'], ['/ui-templates.css', 'ui-templates.css'], ['/fair-studio.mjs', 'fair-studio.mjs'], ['/fair-curriculum.mjs', 'fair-curriculum.mjs'], ['/ui-templates.mjs', 'ui-templates.mjs']]);
const assetFiles = new Map([
  ['/assets/fair-pip-sprites.png', 'fair-pip-sprites.png'],
  ['/assets/fair-voice-sample.wav', 'fair-voice-sample.wav'],
  ['/assets/fair-voice-piper-comparison.wav', 'fair-voice-piper-comparison.wav'],
  ['/assets/fair-voice-qwen-audition.wav', 'fair-voice-qwen-audition.wav'],
]);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.png': 'image/png', '.vtt': 'text/vtt; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const json = (response, status, value) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };

export function fairByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new Error('Invalid byte range.');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(size - 1, Number(match[2])) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) throw new Error('Invalid byte range.');
  return { start, end };
}

async function body(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw Object.assign(new Error('Send JSON content.'), { statusCode: 415 });
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 24_000) throw Object.assign(new Error('The brief is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON.'), { statusCode: 400 }); }
}

export async function fairServerConfig(env, { fetchImpl = fetch, command = fairCommand, fileStat = stat, openReadiness = fairOpenReadiness } = {}) {
  let models = [], planningError = '';
  try {
    const url = new URL('api/tags', `${(env.FAIR_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/`);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json(); models = (result.models || []).map(model => model.name).filter(value => typeof value === 'string');
  } catch { planningError = 'Start Ollama and install a model, for example: ollama pull gemma3:12b.'; }
  let lmstudioModels = [], lmstudioError = '';
  try { lmstudioModels = await fairLmStudioModels(env, { fetchImpl }); }
  catch { lmstudioError = 'Start the local server in LM Studio on port 1234 and load a model.'; }
  const installed = async (paths, module) => {
    try {
      const files = await Promise.all(Object.values(paths).map(path => fileStat(path)));
      if (!files.every(file => file.isFile() && file.size > 0)) return false;
      await command(paths.python, ['-c', `import ${module}; import soundfile`], { timeoutMs: 3000, env });
      return true;
    } catch { return false; }
  };
  const kokoroAvailable = async () => {
    try {
      fairVoiceConfig(env, { voiceProvider: 'kokoro' });
      if (env.FAIR_KOKORO_URL) return (await fetchImpl(new URL('/v1/models', env.FAIR_KOKORO_URL), { signal: AbortSignal.timeout(2000) })).ok;
      return await installed(fairNeuralPaths(env), 'kokoro_onnx');
    } catch { return false; }
  };
  const piperAvailable = async () => {
    try { fairVoiceConfig(env, { voiceProvider: 'piper' }); return await installed(fairPiperPaths(env), 'piper'); }
    catch { return false; }
  };
  const qwenAvailable = async () => {
    try {
      fairVoiceConfig(env, { voiceProvider: 'qwentts' });
      const paths = fairQwenPaths(env);
      const files = await Promise.all([fileStat(paths.python), fileStat(join(paths.modelDir, 'config.json'))]);
      if (!files.every(file => file.isFile() && file.size > 0)) return false;
      await command(paths.python, ['-c', 'import mlx_audio; import soundfile; import mlx.core'], { timeoutMs: 8000, env });
      return true;
    } catch { return false; }
  };
  const [kokoro, piper, qwen, openSource, binaryChecks] = await Promise.all([kokoroAvailable(), piperAvailable(), qwenAvailable(), openReadiness({ env, fetchImpl, command }), Promise.allSettled([
    command(env.FAIR_FFMPEG || 'ffmpeg', ['-version'], { timeoutMs: 3000, env }), command(env.FAIR_FFPROBE || 'ffprobe', ['-version'], { timeoutMs: 3000, env }),
  ])]);
  const renderAvailable = binaryChecks.every(result => result.status === 'fulfilled');
  const voiceOptions = [
    { id: 'qwentts', name: 'Teacher · designed voice', quality: 'neural', available: qwen, sampleUrl: '/assets/fair-voice-qwen-audition.wav',
      description: qwen ? 'Qwen3-TTS VoiceDesign generates the canonical teacher voice locally (designed Indian English persona). A fixed seed improves consistency but review every voice before approval. Phrase timing is measured; word timing is estimated.' : 'Install the pinned Qwen3-TTS VoiceDesign model: run scripts/fair-qwen-audition.py once, or set FAIR_QWEN_PYTHON and FAIR_QWEN_MODEL_DIR.' },
    { id: 'piper', name: 'Indian English · local draft', quality: 'neural', available: piper, sampleUrl: '/assets/fair-voice-sample.wav',
      description: piper ? 'Piper is a lightweight local draft voice. Its delivery can sound robotic; audition it before choosing it for a finished lesson. Phrase timing is measured; word timing is estimated.' : 'Install Piper and the Indian English model for local draft narration, or configure another voice.' },
    { id: 'kokoro', name: 'Kokoro · local neural', quality: 'neural', available: kokoro,
      description: kokoro ? `Kokoro ${env.FAIR_KOKORO_VOICE || 'bf_emma'} configured. This voice is not an Indian English preset.` : 'Install the local Kokoro model and runtime, or configure FAIR_KOKORO_URL.' },
    { id: 'elevenlabs', name: 'ElevenLabs · premium', quality: 'premium', available: Boolean(env.ELEVENLABS_API_KEY && env.FAIR_ELEVENLABS_VOICE_ID),
      description: env.ELEVENLABS_API_KEY && env.FAIR_ELEVENLABS_VOICE_ID ? 'Credentials and selected voice configured; account access is verified during generation. Narration is sent to ElevenLabs.' : 'Set ELEVENLABS_API_KEY and FAIR_ELEVENLABS_VOICE_ID for your chosen premium voice.' },
    { id: 'openai', name: 'OpenAI · premium', quality: 'premium', available: Boolean(env.OPENAI_API_KEY),
      description: env.OPENAI_API_KEY ? 'API key configured; account access is verified during generation. Narration is sent to OpenAI.' : 'Set OPENAI_API_KEY for paid narration.' },
    { id: 'say', name: 'System voice · draft', quality: 'system', available: process.platform === 'darwin', description: 'macOS system speech for drafts. Word timing is estimated.' },
  ];
  const requestedVoiceProvider = env.FAIR_TTS_PROVIDER || 'qwentts';
  const requestedVoice = voiceOptions.find(option => option.id === requestedVoiceProvider);
  const selectedVoice = requestedVoice?.available ? requestedVoice : voiceOptions.find(option => ['qwentts', 'piper', 'kokoro', 'say'].includes(option.id) && option.available) || requestedVoice;
  const voiceProvider = selectedVoice?.id || requestedVoiceProvider;
  let openKokoro = kokoro;
  try { fairOpenEnvironment(env, { voiceProvider: 'kokoro' }); } catch { openKokoro = false; }
  for (const voice of voiceOptions) voice.openSourceAvailable = voice.id === 'piper' ? piper : voice.id === 'kokoro' ? openKokoro : voice.id === 'qwentts' ? qwen : false;
  const openBlockers = [...openSource.blockers, ...(!piper && !openKokoro && !qwen ? ['Install Qwen3-TTS, Piper or Kokoro for open-source narration.'] : [])];
  return { avatars: FAIR_AVATARS, models, pricing: FAIR_PRICING, voiceOptions,
    generationVersions: [
      { id: 'quality', name: 'KooBits-inspired teaching film', available: renderAvailable, recommended: true, description: 'Approved teaching structure: hook, concept, worked example, guided practice and feedback, misconception repair, independent transfer and feedback, recap. Native 1080p animation with protected thinking time.' },
      { id: 'classic', name: 'Classic lesson', available: renderAvailable, description: 'The existing illustrated lessons with HyperFrames animation and your chosen narrator.' },
      { id: 'open-source', name: 'Open-source video', available: openBlockers.length === 0, description: 'Wan2.2 footage with Manim teaching graphics, Qwen planning and local narration. No paid API fallback.', blockers: openBlockers },
    ],
    providers: [
      { id: 'lmstudio', name: 'LM Studio · local', available: lmstudioModels.length > 0 && renderAvailable, models: lmstudioModels, defaultModel: env.FAIR_LMSTUDIO_MODEL || lmstudioModels.find(model => model === 'qwen/qwen3.8-27b') || lmstudioModels[0],
        description: lmstudioError || `Local structured planning through ${lmstudioModels[0]}. Choose narration separately.` },
      { id: 'local', name: 'Ollama · local', available: models.length > 0 && renderAvailable, models, defaultModel: env.FAIR_MODEL || (models.includes('gpt-oss:20b') ? 'gpt-oss:20b' : models[0]),
        description: planningError || 'Ollama planning on this computer. Choose narration separately.' },
      { id: 'openai', name: 'OpenAI', available: Boolean(env.OPENAI_API_KEY) && renderAvailable, models: [env.FAIR_OPENAI_MODEL || 'gpt-5.6-terra'],
        description: env.OPENAI_API_KEY ? 'API key configured. Account access is checked during generation. Brief is sent to OpenAI; choose narration separately.' : 'Set OPENAI_API_KEY in the server .env to enable paid planning. Choose narration separately.' },
    ], defaults: { generationVersion: 'quality', openSourceModel: FAIR_OPEN_MODEL, provider: lmstudioModels.length ? 'lmstudio' : 'local', voiceProvider, model: lmstudioModels.length ? env.FAIR_LMSTUDIO_MODEL || lmstudioModels.find(model => model === 'qwen/qwen3.8-27b') || lmstudioModels[0] : env.FAIR_MODEL || (models.includes('gpt-oss:20b') ? 'gpt-oss:20b' : models[0] || 'gpt-oss:20b'), reviewModel: lmstudioModels.length ? env.FAIR_LMSTUDIO_REVIEW_MODEL || '' : env.FAIR_REVIEW_MODEL || '', targetSeconds: 300, avatar: 'none' },
    capabilities: {
      planning: { available: models.length > 0 || lmstudioModels.length > 0, detail: lmstudioModels.length ? `LM Studio is ready with ${lmstudioModels.length} local model${lmstudioModels.length === 1 ? '' : 's'}.` : planningError || `${models.length} local model${models.length === 1 ? '' : 's'} available.` },
      narration: { available: Boolean(selectedVoice?.available), detail: selectedVoice?.description || `Unsupported voice provider: ${voiceProvider}.` },
      render: { available: binaryChecks.every(result => result.status === 'fulfilled'), detail: 'HyperFrames + FFmpeg • local MP4 export. First render may install a browser.' },
    } };
}

export function fairCreateServer(store, { env = process.env } = {}) {
  let cachedConfig, configTime = 0;
  return createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = request.headers.host || '';
      if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) return json(response, 403, { error: 'This studio is available on localhost only.' });
      const url = new URL(request.url, `http://${host}`), route = url.pathname;
      if (request.method === 'GET' && staticFiles.has(route)) {
        const file = join(appDir, 'public', staticFiles.get(route));
        response.writeHead(200, { 'content-type': mimeTypes[extname(file)], 'cache-control': 'no-cache' });
        return response.end(await readFile(file));
      }
      if (['GET', 'HEAD'].includes(request.method) && assetFiles.has(route)) {
        const file = join(appDir, 'assets', assetFiles.get(route)), info = await stat(file);
        let range;
        try { range = fairByteRange(request.headers.range, info.size); }
        catch { response.writeHead(416, { 'content-range': `bytes */${info.size}` }); return response.end(); }
        const headers = { 'content-type': mimeTypes[extname(file)], 'content-length': range ? range.end - range.start + 1 : info.size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
        if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
        response.writeHead(range ? 206 : 200, headers);
        if (request.method === 'HEAD') return response.end();
        const stream = createReadStream(file, range || {});
        response.on('close', () => stream.destroy()); stream.on('error', () => response.destroy()); stream.pipe(response); return;
      }
      if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && request.headers.origin !== `http://${host}`)) return json(response, 403, { error: 'Cross-origin access is not allowed.' });
      if (request.method === 'GET' && route === '/api/config') {
        if (!cachedConfig || Date.now() - configTime > 15_000) { cachedConfig = await fairServerConfig(env); configTime = Date.now(); }
        return json(response, 200, cachedConfig);
      }
      if (request.method === 'GET' && route === '/api/jobs') return json(response, 200, { jobs: store.list() });
      if (request.method === 'POST' && route === '/api/jobs') return json(response, 202, { job: await store.create(await body(request)) });
      if (request.method === 'GET' && route === '/api/curriculum') {
        const trees = await fairLoadCurricula(env);
        return json(response, 200, { trees, coverage: fairCurriculumCoverage(fairCurriculumIndex(trees), store.list()) });
      }
      if (request.method === 'POST' && route === '/api/batch') {
        const input = await body(request);
        const trees = await fairLoadCurricula(env);
        const index = fairCurriculumIndex(trees);
        let topicIds = [];
        if (input.all === true) topicIds = index.map(item => item.topicId);
        else if (typeof input.unitId === 'string') topicIds = index.filter(item => item.unitId === input.unitId).map(item => item.topicId);
        else if (Array.isArray(input.topicIds)) topicIds = [...new Set(input.topicIds.filter(value => typeof value === 'string'))].slice(0, 200);
        if (input.all === true || typeof input.unitId === 'string' || topicIds.length > 1) throw Object.assign(new Error('Bulk generation is paused. Select one lesson and review its teaching film first.'), { statusCode: 409 });
        if (input.onlyPending === true) {
          const done = new Set(fairCurriculumCoverage(index, store.list())
            .filter(entry => entry.jobs.some(job => job.status === 'completed'))
            .map(entry => entry.topicId));
          topicIds = topicIds.filter(id => !done.has(id));
        }
        if (!topicIds.length) throw Object.assign(new Error('Choose topics, a unit, or all to generate.'), { statusCode: 400 });
        const overrides = {};
        for (const key of ['provider', 'model', 'voiceProvider', 'generationVersion', 'avatar']) if (typeof input[key] === 'string') overrides[key] = input[key];
        if (input.targetSeconds !== undefined) overrides.targetSeconds = input.targetSeconds;
        const queued = [], errors = [];
        for (const topicId of topicIds) {
          const found = fairFindTopic(trees, topicId);
          if (!found) { errors.push({ topicId, error: 'Unknown curriculum topic.' }); continue; }
          try { const job = await store.create(fairTopicBrief(found, overrides)); queued.push({ topicId, jobId: job.id }); }
          catch (error) {
            errors.push({ topicId, error: error.message });
            if (error.statusCode === 429) break;
          }
        }
        return json(response, 202, { queued, errors, count: queued.length });
      }
      const match = /^\/api\/jobs\/([^/]+)(?:\/(retry|cancel|review|artifacts)(?:\/([^/]+))?)?$/.exec(route);
      if (!match) return json(response, 404, { error: 'Not found.' });
      const job = store.get(match[1]);
      if (!job) return json(response, 404, { error: 'Lesson not found.' });
      if (!match[2] && request.method === 'GET') return json(response, 200, { job });
      if (request.method === 'POST' && ['retry', 'cancel', 'review'].includes(match[2]) && !match[3]) {
        const input = await body(request);
        return json(response, 200, { job: match[2] === 'review' ? await store.review(job.id, input) : await store[match[2]](job.id) });
      }
      const artifacts = fairJobArtifacts(job.brief);
      if (['GET', 'HEAD'].includes(request.method) && match[2] === 'artifacts' && artifacts[match[3]] && job.status === 'completed') {
        const directory = await realpath(join(store.directory(job.id), 'project'));
        const filename = artifacts[match[3]], file = await realpath(join(directory, filename));
        if (!file.startsWith(directory + sep)) return json(response, 403, { error: 'Invalid artifact location.' });
        const info = await stat(file);
        if (!info.isFile()) return json(response, 404, { error: 'Artifact not found.' });
        let range;
        try { range = fairByteRange(request.headers.range, info.size); } catch { response.writeHead(416, { 'content-range': `bytes */${info.size}` }); return response.end(); }
        const headers = { 'content-type': mimeTypes[extname(file)] || 'application/octet-stream', 'accept-ranges': 'bytes', 'content-length': range ? range.end - range.start + 1 : info.size, 'cache-control': 'no-store' };
        if (match[3] === 'composition') headers['content-disposition'] = `attachment; filename="${job.brief?.generationVersion === 'open-source' ? 'fair-manim-scene.py' : 'composition.html'}"`;
        if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
        response.writeHead(range ? 206 : 200, headers);
        if (request.method === 'HEAD') return response.end();
        const stream = createReadStream(file, range || {});
        response.on('close', () => stream.destroy());
        stream.on('error', () => response.destroy()); stream.pipe(response); return;
      }
      return json(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (response.headersSent) return response.destroy();
      const status = error.name === 'ZodError' ? 400 : error.statusCode || (error.code === 'ENOENT' ? 404 : 500);
      const message = error.name === 'ZodError' ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') : status === 500 ? 'The studio could not complete this request. Check the server log.' : error.message;
      if (status === 500) console.error(error);
      return json(response, status, { error: message });
    }
  });
}

async function main() {
  const port = Number(process.env.FAIR_PORT || 4310);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('FAIR_PORT must be between 1024 and 65535.');
  const root = resolve(process.env.FAIR_DATA_DIR || join(appDir, '.fair-video'));
  await mkdir(root, { recursive: true });
  const lockFile = join(root, 'server.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockFile, 'utf8'));
    if (!Number.isInteger(pid) || pid < 1) throw new Error(`Invalid studio lock at ${lockFile}. Inspect it before removing it.`);
    try { process.kill(pid, 0); throw new Error('Another studio instance is using this data directory.'); }
    catch (check) { if (check.code !== 'ESRCH') throw check; }
    await unlink(lockFile); lock = await open(lockFile, 'wx');
  }
  await lock.writeFile(String(process.pid)); await lock.close();
  const store = new FairJobStore(root); await store.init();
  const server = fairCreateServer(store);
  server.requestTimeout = 30_000; server.headersTimeout = 10_000;
  const stop = async () => { await store.stop(); await unlink(lockFile).catch(() => {}); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 4000).unref(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  server.on('error', async error => { await unlink(lockFile).catch(() => {}); console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Video Studio → http://127.0.0.1:${port}\nProjects: ${root}`));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
