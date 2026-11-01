import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OPENMONTAGE_COMMIT, runWorkerProcess, workerPaths, workerReadiness } from '../studio-v2/worker/index.mjs';

test('worker reports missing setup honestly and respects isolated path overrides', async () => {
  const paths = workerPaths({ STUDIO_V2_OPENMONTAGE_DIR: '/tmp/no-openmontage-here', STUDIO_V2_PYTHON: '/tmp/no-python-here' });
  assert.equal(paths.checkout, '/tmp/no-openmontage-here');
  assert.equal(paths.python, '/tmp/no-python-here');
  const result = await workerReadiness({ env: { ...process.env, STUDIO_V2_OPENMONTAGE_DIR: paths.checkout, STUDIO_V2_PYTHON: paths.python } });
  assert.equal(result.available, false);
  assert.match(result.detail, /setup:studio-v2/);
  assert.equal(result.version, OPENMONTAGE_COMMIT);
});

test('worker accepts only tagged machine result and preserves failure status', async () => {
  const result = await runWorkerProcess(process.execPath, ['-e', 'console.log("warning");console.log(JSON.stringify({type:"result",result:{success:false,error:"layout failure"}}));process.exitCode=1']);
  assert.equal(result.code, 1);
  assert.equal(result.data.success, false);
  assert.equal(result.data.error, 'layout failure');
  await assert.rejects(runWorkerProcess(process.execPath, ['-e', 'console.log("not a result")']), /no result/);
});

test('worker timeout stops execution with a clear bounded failure', async () => {
  await assert.rejects(runWorkerProcess(process.execPath, ['-e', 'setInterval(()=>{},100)'], { timeoutMs: 70 }), /time limit/);
});

test('worker cancellation stops the process group including descendants', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'v2-worker-'));
  const marker = join(directory, 'child.txt'), controller = new AbortController();
  try {
    const source = `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'leaked'),400)`)}],{stdio:'ignore'});console.log(JSON.stringify({type:'progress'}));setInterval(()=>{},100);`;
    const task = runWorkerProcess(process.execPath, ['-e', source], { signal: controller.signal, onLine: () => controller.abort() });
    await assert.rejects(task, /cancelled/);
    await new Promise(resolve => setTimeout(resolve, 550));
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('pre-cancelled worker never starts a child', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runWorkerProcess('/not/an/executable', [], { signal: controller.signal }), /cancelled/);
});
