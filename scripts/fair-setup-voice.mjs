#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand } from '../src/fair-utils.mjs';

const fairRoot = fileURLToPath(new URL('../', import.meta.url));
const modelRepository = 'https://huggingface.co/navgurukul-ai-labs/text-to-speech-en-IN-piper';
const revision = 'a4ff93ef95684b5dafc3800b99fb78a6b4c30235';
const upstreamName = 'en_IN-dataset=spicor-english-base=ljspeech-epochs=1089.onnx';
export const FAIR_VOICE_INSTALL = {
  modelRepository, revision, modelLicense: 'AGPL-3.0',
  runtime: { 'piper-tts': '1.4.1', soundfile: '0.13.1' },
  runtimeLicense: 'GPL-3.0', runtimeSource: 'https://github.com/OHF-Voice/piper1-gpl',
  bootstrap: 'uv==0.13.1', python: '3.12',
  files: [
    { name: 'fair-indian-english.onnx', upstream: upstreamName, bytes: 63516050, sha256: 'e19debae94b70ecc9d22603820373c4dc9bfceb4de8675e1138d2072fca11494' },
    { name: 'fair-indian-english.onnx.json', upstream: `${upstreamName}.json`, bytes: 4858, sha256: '108c16883ad72e74f8c1894dd75b045fc955d4c3b338e4a501737cf6c85ce99e' },
  ],
};

export async function fairVerifyVoiceAsset(path, expected) {
  try { const bytes = await readFile(path); return bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.sha256; }
  catch { return false; }
}

async function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/fair-setup-voice.mjs [--check]\nInstalls the default local Indian English Piper voice in .fair-neural/.\nRequires Node22+ and Python3.9+ with venv; downloads Python3.12 if needed.\nDownload: model63.5MB plus Python/runtime packages. No API key or paid service.\nModel: AGPL-3.0; Piper runtime: GPL-3.0. Source and checksums are recorded locally.\n--check verifies files/runtime without installing, downloading, or changing files.');
    return;
  }
  if (args.some(arg => arg !== '--check')) throw new Error('Unknown argument. Use --help.');
  const home = join(fairRoot, '.fair-neural'), modelDir = join(home, 'piper');
  const python = join(home, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const runtimeCheck = async () => {
    try {
      await fairCommand(python, ['-c', `import piper,soundfile; from importlib.metadata import version; assert version('piper-tts')=='1.4.1'; assert version('soundfile')=='0.13.1'`], { timeoutMs: 15000 });
      return true;
    } catch { return false; }
  };
  const runtimeReady = await runtimeCheck();
  const assetsReady = await Promise.all(FAIR_VOICE_INSTALL.files.map(file => fairVerifyVoiceAsset(join(modelDir, file.name), file)));
  if (args.includes('--check')) {
    console.log(JSON.stringify({ ready: runtimeReady && assetsReady.every(Boolean), runtime: runtimeReady, assets: FAIR_VOICE_INSTALL.files.map((file, index) => ({ file: file.name, verified: assetsReady[index] })) }, null, 2));
    if (!runtimeReady || !assetsReady.every(Boolean)) process.exitCode = 1;
    return;
  }
  console.log('Setting up Indian English Piper narration locally. Model download:63.5MB plus runtime/Python if missing. Model license:AGPL-3.0; runtime:GPL-3.0.');
  await mkdir(modelDir, { recursive: true });
  if (!runtimeReady) {
    const bootstrap = join(home, 'bootstrap'), bootstrapPython = join(bootstrap, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    await fairCommand(process.env.FAIR_SETUP_PYTHON || 'python3', ['-m', 'venv', bootstrap], { timeoutMs: 120000 });
    await fairCommand(bootstrapPython, ['-m', 'pip', 'install', 'uv==0.13.1'], { timeoutMs: 300000 });
    const uv = join(bootstrap, process.platform === 'win32' ? 'Scripts/uv.exe' : 'bin/uv');
    let exists = true; try { await access(python); } catch { exists = false; }
    if (!exists) await fairCommand(uv, ['venv', '--python', '3.12', join(home, 'venv')], { timeoutMs: 600000 });
    await fairCommand(uv, ['pip', 'install', '--python', python, 'piper-tts==1.4.1', 'soundfile==0.13.1'], { timeoutMs: 600000 });
  }
  for (const [index, file] of FAIR_VOICE_INSTALL.files.entries()) {
    if (assetsReady[index]) continue;
    console.log(`Downloading ${file.name} (${file.bytes} bytes).`);
    const url = `${modelRepository}/resolve/${revision}/${encodeURIComponent(file.upstream)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error(`Model download failed: HTTP${response.status}.`);
    const destination = join(modelDir, file.name), temporary = `${destination}.download`;
    try {
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(temporary, bytes);
      if (!await fairVerifyVoiceAsset(temporary, file)) throw new Error(`Checksum mismatch for ${file.name}; downloaded bytes were rejected.`);
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
  if (!await runtimeCheck()) throw new Error('Piper runtime verification failed. No substitute voice was configured.');
  await writeFile(join(modelDir, 'fair-provenance.json'), `${JSON.stringify(FAIR_VOICE_INSTALL, null, 2)}\n`);
  console.log('Indian English neural voice is ready. FAIR_TTS_PROVIDER=piper selects it; the app also defaults to Piper locally.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
