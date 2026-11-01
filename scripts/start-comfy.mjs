import { spawn } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairComfyModels, fairComfyRevision } from './setup-comfy.mjs';
import { fairCommand } from '../src/utils.mjs';

const fairRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fairRuntime = join(fairRoot, '.fair-open');
const fairLocalModels = join(fairRoot, '.local-video-models');
try {
  const manifest = JSON.parse(await readFile(join(fairRuntime, 'fair-comfy-models.json'), 'utf8'));
  const revision = (await fairCommand('git', ['rev-parse', 'HEAD'], { cwd: join(fairRuntime, 'comfy') })).stdout.trim();
  if (manifest.comfyRevision !== fairComfyRevision || revision !== fairComfyRevision) throw new Error('The local ComfyUI installation does not match the pinned revision.');
  for (const model of fairComfyModels) {
    if (manifest.models?.find(item => item.file === model.file)?.sha256 !== model.sha256 || (await stat(join(fairRuntime, 'comfy/models', model.file))).size !== model.size) throw new Error(`The verified ${model.file} installation is missing or incomplete.`);
  }
  const extraModels = join(fairLocalModels, 'comfy-extra-model-paths.yaml');
  await writeFile(extraModels, `local_video_models:\n  base_path: ${JSON.stringify(fairLocalModels)}\n  diffusion_models: |\n    ltx-2.5/diffusion_models\n    minimax-h3/diffusion_models\n  text_encoders: |\n    ltx-2.5/text_encoders\n    minimax-h3/text_encoders\n  vae: |\n    ltx-2.5/vae\n    minimax-h3/vae\n  loras: minimax-h3/loras\n`);
  const child = spawn(join(fairRuntime, 'comfy-venv/bin/python'), ['main.py', '--listen', '127.0.0.1', '--port', '8188', '--offline', '--disable-all-custom-nodes', '--extra-model-paths-config', extraModels, '--force-fp32', '--fp16-text-enc', '--fp32-vae', '--use-split-cross-attention', '--reserve-vram', '8'], { cwd: join(fairRuntime, 'comfy'), stdio: 'inherit', env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' } });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.once('error', error => { console.error(error.message); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(`ComfyUI is not ready: ${error.message}. Run node scripts/setup-comfy.mjs first.`);
  process.exitCode = 1;
}
