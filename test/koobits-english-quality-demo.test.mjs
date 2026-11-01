import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("proofs/koobits-english-quality-demo");

test("English quality demo is local, deterministic, narrated, and gives the learner time", async () => {
  const index = await readFile(`${root}/index.html`, "utf8");
  assert.match(index, /data-duration="155"/);
  assert.match(index, /data-width="1920"\s+data-height="1080"/);
  assert.match(index, /assets\/audio\/voice\.wav/);
  assert.doesNotMatch(index, /https?:\/\//);

  const response = await readFile(`${root}/compositions/respond.html`, "utf8");
  assert.match(response, /duration:\s*10,\s*ease:\s*["']none["']/);
  assert.match(response, /hop \+ e = hope/);
  assert.match(response, /window\.__timelines\.respond/);

  const captions = await readFile(`${root}/compositions/captions.html`, "utf8");
  assert.match(captions, /data-start="115"\s+data-duration="15"/);
  assert.match(captions, /data-start="151"\s+data-duration="4"/);

  const review = await readFile(`${root}/REVIEW.md`, "utf8");
  assert.match(review, /CKSaEY7nYLY/);
  assert.match(review, /Not a lesson/);

  const duration = Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        `${root}/assets/audio/voice.wav`,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  assert.equal(duration, 155);
});
