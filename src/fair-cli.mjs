import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { normalizeBrief } from './fair-plan.mjs';
import { fairRunPipeline } from './fair-pipeline.mjs';
import { fairFindTopic, fairLoadCurricula, fairTopicBrief } from './fair-curriculum.mjs';

const args = process.argv.slice(2);
const usage = 'Usage: npm run generate -- "Grade 5 place value: explain digit value and zero placeholders" [--seconds 300] [--model gpt-oss:20b] [--voice qwentts|piper|kokoro|say] [--version quality|classic|open-source]\n       npm run topic -- s5-pv-rounding [--voice qwentts] [--model gpt-oss:20b]';

const flags = {};
let positional = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--topic') { flags['--topic'] = args[++i]; continue; }
  if (args[i].startsWith('--')) {
    if (!['--seconds', '--avatar', '--model', '--provider', '--version', '--voice'].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or incomplete flag: ${args[i]}\n${usage}`);
    flags[args[i]] = args[++i]; continue;
  }
  if (positional) throw new Error(`Unexpected argument: ${args[i]}\n${usage}`);
  positional = args[i];
}
if (!flags['--topic'] && !positional) { console.error(usage); process.exit(2); }

let input;
if (flags['--topic']) {
  const found = fairFindTopic(await fairLoadCurricula(), flags['--topic']);
  if (!found) { console.error(`Unknown curriculum topic: ${flags['--topic']}. Run npm run coverage to list topics.`); process.exit(2); }
  input = fairTopicBrief(found, {});
  console.log(`Topic: ${found.topic.title} (${found.topic.objectives.map(o => o.code).join(', ')})`);
} else {
  input = { text: positional, targetSeconds: Number(flags['--seconds'] || 300) };
}
const brief = normalizeBrief({ ...input, generationVersion: flags['--version'] || 'quality', provider: flags['--provider'] || 'local', avatar: flags['--avatar'] || 'none', ...(flags['--seconds'] && flags['--topic'] ? { targetSeconds: Number(flags['--seconds']) } : {}), ...(flags['--model'] ? { model: flags['--model'] } : {}), ...(flags['--voice'] ? { voiceProvider: flags['--voice'] } : {}) });
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(resolve(process.env.FAIR_DATA_DIR || join(appDir, '.fair-video')), `cli-${randomUUID()}`);
const controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('Generation cancelled.')));
await mkdir(directory, { recursive: true });
console.log(`Output: ${directory}`);
try {
  const result = await fairRunPipeline(brief, directory, { signal: controller.signal, onProgress: event => console.log(`${event.progress ?? 0}% ${event.message}`) });
  console.log(`Video: ${join(result.projectDir, 'lesson.mp4')}\nDuration: ${Math.round(result.report.durationSeconds)} seconds\nStatus: generated draft, ready for educator review.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
