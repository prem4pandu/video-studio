#!/usr/bin/env node
import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand, fairWriteJson } from '../src/utils.mjs';
import { OPENMONTAGE_COMMIT, HYPERFRAMES_VERSION, workerPaths } from '../studio-v2/worker/index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = workerPaths();
const exists = file => access(file).then(() => true, () => false);
const command = (bin, args, options = {}) => fairCommand(bin, args, { cwd: root, timeoutMs: 10 * 60_000, onOutput: text => process.stdout.write(text), ...options });

async function setup() {
  const version = JSON.parse(await readFile(join(root, 'node_modules/hyperframes/package.json'), 'utf8')).version;
  if (version !== HYPERFRAMES_VERSION) throw new Error(`Install the project's pinned hyperframes@${HYPERFRAMES_VERSION} first.`);
  await mkdir(dirname(paths.checkout), { recursive: true });
  if (!(await exists(join(paths.checkout, '.git')))) {
    // The optional local source avoids redownloading an already-reviewed checkout.
    const source = process.env.STUDIO_V2_SETUP_SOURCE || 'https://github.com/calesthio/OpenMontage.git';
    await command('git', ['clone', '--no-hardlinks', '--no-checkout', source, paths.checkout]);
    await command('git', ['-C', paths.checkout, 'checkout', '--detach', OPENMONTAGE_COMMIT]);
  }
  const revision = await fairCommand('git', ['-C', paths.checkout, 'rev-parse', 'HEAD']);
  if (revision.stdout.trim() !== OPENMONTAGE_COMMIT) throw new Error('Existing OpenMontage checkout is a different version. Choose an empty STUDIO_V2_OPENMONTAGE_DIR; setup will not overwrite it.');
  await fairCommand('git', ['-C', paths.checkout, 'diff', '--exit-code', 'HEAD', '--']);
  if (!(await exists(paths.python))) {
    const python = process.env.STUDIO_V2_SETUP_PYTHON || (await exists('/opt/homebrew/bin/python3.12') ? '/opt/homebrew/bin/python3.12' : 'python3');
    await fairCommand(python, ['-c', 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ is required"']);
    if (process.env.STUDIO_V2_PYTHON) throw new Error('STUDIO_V2_PYTHON does not exist; provide an existing interpreter or omit the override.');
    await command(python, ['-m', 'venv', join(paths.checkout, '.venv')]);
  }
  await command(paths.python, ['-m', 'pip', 'install', 'PyYAML==6.0.3', 'pydantic==2.13.5', 'jsonschema==4.25.1']);
  await fairCommand(paths.python, ['-c', 'from tools.tool_registry import registry; registry.discover("tools.video.hyperframes_compose"); assert registry.get("hyperframes_compose")'], { cwd: paths.checkout });
  await fairWriteJson(join(paths.checkout, 'studio-v2-install.json'), { commit: OPENMONTAGE_COMMIT, hyperframes: version, license: 'AGPL-3.0', scope: 'local HyperFrames adapter only', installedAt: new Date().toISOString() });
  console.log('\nOpenMontage renderer installed. No cloud providers, model weights or account keys were installed.');
  console.log('Run npm start and open the Studio V2 screen. Renderer readiness also requires local FFmpeg and Chrome.');
}

setup().catch(error => { console.error(error.message); process.exitCode = 1; });
