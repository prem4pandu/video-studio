import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fairGenerateComparisonClip, fairVideoComparisonDefaults } from '../src/local-video-models.mjs';

const prompt = 'Locked overhead camera, warm neutral tabletop, clean educational stop-motion. One long horizontal paper strip lies centered. The left half is shaded blue and the right half is unshaded. A pair of scissors makes exactly one vertical cut through each half so the same strip becomes four equal pieces; exactly two pieces remain blue. The strip never changes size or position. Smooth continuous motion, crisp paper edges, no hands, no text, no numbers, no logos, no extra objects.';
const requested = process.argv.find(argument => argument.startsWith('--models='))?.split('=')[1]?.split(',') || ['h3', 'ltx', 'wan'];
const invalid = requested.filter(model => !['h3', 'ltx', 'wan'].includes(model));
if (invalid.length) throw new Error(`Unknown models: ${invalid.join(', ')}`);
const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const directory = resolve('outputs/local-model-tests', stamp);
await mkdir(directory, { recursive: true });
const results = [];
for (const model of requested) {
  const started = new Date().toISOString();
  try {
    const result = await fairGenerateComparisonClip({ model, prompt, directory, options: fairVideoComparisonDefaults, onProgress: message => console.log(message) });
    results.push({ status: 'passed', started, ...result });
    console.log(`${model}: ${result.file} (${result.elapsedSeconds.toFixed(1)}s)`);
  } catch (error) {
    results.push({ model, status: 'failed', started, error: error.message });
    console.error(`${model}: ${error.message}`);
  }
}
const report = { generatedAt: new Date().toISOString(), prompt, settings: fairVideoComparisonDefaults, results };
await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${join(directory, 'report.json')}`);
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
