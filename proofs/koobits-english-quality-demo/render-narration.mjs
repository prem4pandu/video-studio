import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve("proofs/koobits-english-quality-demo"),
  rows = JSON.parse(readFileSync(join(root, "narration.json"), "utf8")),
  work = mkdtempSync(join(tmpdir(), "english-voice-"));
try {
  for (const [i, row] of rows.entries()) {
    row.file = join(work, `line-${i}.wav`);
    execFileSync(
      "npx",
      [
        "hyperframes",
        "tts",
        row.text,
        "--voice",
        "af_heart",
        "--speed",
        "0.94",
        "--output",
        row.file,
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          HYPERFRAMES_PYTHON: resolve(".fair-open/kokoro-venv/bin/python"),
          PHONEMIZER_ESPEAK_LIBRARY:
            "/opt/homebrew/opt/espeak-ng/lib/libespeak-ng.dylib",
          ESPEAK_DATA_PATH: "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data",
        },
      },
    );
  }
  const args = rows.flatMap((r) => ["-i", r.file]),
    filters = rows.map(
      (r, i) => `[${i}:a]adelay=${r.start * 1000}|${r.start * 1000}[a${i}]`,
    ),
    mix = rows.map((_, i) => `[a${i}]`).join("");
  filters.push(
    `${mix}amix=inputs=${rows.length}:duration=longest:normalize=0,apad=pad_dur=155,atrim=0:155,loudnorm=I=-16:TP=-3:LRA=7[out]`,
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      ...args,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-ar",
      "48000",
      "-ac",
      "2",
      join(root, "assets/audio/voice.wav"),
    ],
    { stdio: "inherit" },
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
