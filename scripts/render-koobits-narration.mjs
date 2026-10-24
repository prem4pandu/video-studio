import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const project = resolve('proofs/koobits-place-value-lesson');
const script = readFileSync(join(project, 'SCRIPT.md'), 'utf8');
const target = join(project, 'assets/audio/voice.wav');
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
    row.output = output;
  }

  const inputs = rows.flatMap(row => ['-i', row.output]);
  const filters = rows.map((row, index) => `[${index}:a]adelay=${row.start * 1000}|${row.start * 1000}[a${index}]`);
  const mixInputs = rows.map((_, index) => `[a${index}]`).join('');
  filters.push(`${mixInputs}amix=inputs=${rows.length}:duration=longest:normalize=0,apad=pad_dur=280,atrim=0:280,loudnorm=I=-16:TP=-3:LRA=7[out]`);
  execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', target], { stdio: 'inherit' });
} finally {
  rmSync(work, { recursive: true, force: true });
}
