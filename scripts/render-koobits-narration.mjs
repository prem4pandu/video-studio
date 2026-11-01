import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const project = resolve('proofs/koobits-place-value-lesson');
const script = readFileSync(join(project, 'SCRIPT.md'), 'utf8');
const target = join(project, 'assets/audio/voice.wav');
const deliveryTarget = join(project, 'assets/audio/voice.m4a');
const work = mkdtempSync(join(tmpdir(), 'koobits-voice-'));
const parseTime = value => {
  const [minutes, seconds] = value.split(':').map(Number);
  return minutes * 60 + seconds;
};
const rows = [...script.matchAll(/^\| (\d+:\d+)–(\d+:\d+) \| (.*?) \|/gm)]
  .map((match, index) => ({ index, start: parseTime(match[1]), end: parseTime(match[2]), text: match[3] }))
  .filter(row => !row.text.includes('[Silence'))
  .map(row => ({ ...row, text: row.text.replaceAll('**', '').replace(/^“|”$/g, '') }));

if (rows.length < 20) throw new Error('Timed narration rows were not parsed from SCRIPT.md.');
mkdirSync(join(project, 'assets/audio'), { recursive: true });

try {
  for (const row of rows) {
    const output = join(work, `line-${String(row.index).padStart(2, '0')}.wav`);
    execFileSync('npx', ['hyperframes', 'tts', row.text, '--voice', 'af_heart', '--speed', '0.94', '--output', output], {
      stdio: 'inherit',
      env: {
        ...process.env,
        HYPERFRAMES_PYTHON: resolve('.fair-open/kokoro-venv/bin/python'),
        PHONEMIZER_ESPEAK_LIBRARY: '/opt/homebrew/opt/espeak-ng/lib/libespeak-ng.dylib',
        ESPEAK_DATA_PATH: '/opt/homebrew/opt/espeak-ng/share/espeak-ng-data',
      },
    });
    const duration = Number(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', output,
    ], { encoding: 'utf8' }).trim());
    const budget = row.end - row.start - 0.2;
    const rate = duration / budget;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Narration row ${row.index} produced invalid audio.`);
    if (rate > 1.18) {
      throw new Error(`Narration row ${row.index} is ${duration.toFixed(2)}s but has only ${budget.toFixed(2)}s. Shorten the copy instead of overlapping the next line.`);
    }
    row.output = output;
    row.budget = budget;
    row.rate = Math.max(1, rate);
  }

  const inputs = rows.flatMap(row => ['-i', row.output]);
  const filters = rows.map((row, index) => {
    const fit = row.rate > 1 ? `atempo=${row.rate.toFixed(6)},` : '';
    const fadeStart = Math.max(0, row.budget - 0.08).toFixed(3);
    return `[${index}:a]${fit}atrim=0:${row.budget.toFixed(3)},afade=t=out:st=${fadeStart}:d=0.08,adelay=${row.start * 1000}|${row.start * 1000}[a${index}]`;
  });
  const mixInputs = rows.map((_, index) => `[a${index}]`).join('');
  filters.push(`${mixInputs}amix=inputs=${rows.length}:duration=longest:normalize=0,apad=pad_dur=280,atrim=0:280,loudnorm=I=-16:TP=-3:LRA=7[out]`);
  execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', target], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-i', target, '-c:a', 'aac', '-b:a', '192k', deliveryTarget], { stdio: 'inherit' });
} finally {
  rmSync(work, { recursive: true, force: true });
}
