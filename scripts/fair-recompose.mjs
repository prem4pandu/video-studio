// Rebuild only the composition for an existing job: lesson and audio are already
// on disk, so a layout or styling change can be checked in seconds instead of a
// full re-render.
//
// Usage: node scripts/fair-recompose.mjs .fair-video/<job>/project
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fairCompose } from '../src/fair-composition.mjs';
import { normalizeBrief } from '../src/fair-plan.mjs';

const directory = resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('Usage: node scripts/fair-recompose.mjs <projectDir>');
  process.exit(2);
}
const read = async file => JSON.parse(await readFile(join(directory, file), 'utf8'));
const lesson = await read('lesson.json');
const tracks = await read('narration.json');
const { brief } = await read('manifest.json');
const composition = await fairCompose(lesson, tracks, normalizeBrief(brief), directory);
console.log(JSON.stringify({ durationSeconds: composition.durationSeconds, intro: composition.intro, pauses: composition.audioCues.pauses.length }, null, 2));
