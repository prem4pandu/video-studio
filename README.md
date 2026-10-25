# Video Studio

A standalone, fully local concept-to-video studio for teaching. Give it a
teaching idea — or a node in a curriculum tree — and it plans a short lesson,
narrates it with a designed local voice, animates it deterministically, renders
an MP4 with captions, and holds it in a review queue until a teacher approves
it. No paid APIs are required anywhere in the pipeline.

Built for Apple Silicon. Every generated video is a **draft** until an educator
reviews it.

## What it does

```
concept or curriculum topic
  → structured lesson plan   (local Ollama model, JSON-constrained, repaired)
  → deterministic checks     (exact arithmetic, coverage, cue timing)
  → independent critique     (a second model reviews the draft)
  → narration                (Qwen3-TTS VoiceDesign · Piper · Kokoro · say)
  → animation                (HyperFrames/GSAP deterministic scene renderers)
  → title sequence + cards   (beat-aligned intro, lesson card, closing rule card)
  → music bed + teaching SFX (licence-audited library, deterministic effects)
  → mix + render + verify    (ducked audio mix, ffmpeg/ffprobe stream checks)
  → educator review queue    (approve / needs-changes / reject, with notes)
```

## Quick start

```bash
npm install
cp .env.example .env
npm run check:env        # reports what is installed and what is missing
npm start              # studio UI → http://127.0.0.1:4310
```

- **Single concept**: open the studio, describe the lesson, generate.
- **Curriculum mode**: open `curriculum.html` (or the topbar link) to browse the
  Cambridge Primary Mathematics Stage 5 tree, generate per topic or unit, and
  work the review queue.

## CLI

```bash
npm run generate -- "Teach rounding to the nearest whole number" --seconds 300
npm run topic -- s5-pv-rounding          # one curriculum topic → video
npm run batch -- --unit s5-place-value   # a whole unit, sequentially
npm run batch -- --all --only-pending    # resume the whole tree
npm run coverage                          # per-topic status report
npm run metrics -- <job>/project          # pacing audit: frozen frames, sync density
npm run recompose -- <job>/project        # rebuild composition only, keep the audio
npm run render:phase-a                    # the presentation benchmark render
```

## Presentation: title sequence, music and interaction

Two brief flags opt in to the presentation layer; both default to the previous
behaviour so existing jobs render exactly as before.

```jsonc
{ "intro": "card" | "sting" | "none",   // title card + closing card
  "audio": "music" | "voice" }          // voice only, or voice + bed + effects
```

- **Title sequence** — a beat-aligned card ("Today we'll be able to…" plus the
  lesson's child-facing `successStatement`), and a closing card that restates the
  rule. They carry no narration, so they cannot disturb measured speech timing.
- **Music** — the pipeline never downloads audio. It reads
  `assets/audio/music-manifest.json`, picks the first track matching the lesson
  mood, converts and loops it, and records the licence in `quality-report.json`.
  With no matching track it synthesises a labelled placeholder so generation still
  works. Read the manifest's `_readme` before adding a track: only add what you
  have licence-checked, and record the source URL and verification date.
- **Effects** — eight synthesised cues (tick, chime, click, pop, whoosh, pen,
  hmm, success) placed from the composed lesson; they are deterministic and carry
  no licence.
- **Mix** — one ffmpeg graph: voice normalised, bed ducked under it, bed thinned
  during answer-free thinking pauses, limiter, single loudness target. The graph
  and the bed's source are saved in `audio-mix.json`. `lesson-voice.mp4` is kept
  alongside `lesson.mp4` as the music-free cut and the re-mix source.
- **Transformation engine** — fraction lessons do not reveal a second picture:
  `src/partition.mjs` cuts the same bar in place (blade, squash, cut lines),
  counts the pieces and the shaded pieces in order, marks the edge that did not
  move, then writes and annotates the equivalence. The shaded amount is a single
  rectangle that is never resized, so the invariant is structural rather than
  claimed. Every scene also carries a slow push and a breathing guide.
- **Interaction** — question scenes carry option cards and a rendered countdown
  ring; the answer scene replays the same cards with the correct one emphasised
  and the others struck through. Nodes are derived from the lesson (a fraction
  choice question resolves against the answer scene's fraction), or supplied
  explicitly; a `predict` node on the hook commits the learner before any reveal.

## Real local pipeline test

```bash
# Once: download and verify the 1.28 GB Apache-2.0 word-alignment model.
.fair-neural/qwen-venv/bin/python scripts/setup-alignment.py

# Generates a real short place-value lesson with the configured planner,
# a separate qwen3:30b critic, Qwen3-TTS, word alignment, Manim and FFmpeg.
npm run test:pipeline

# Resume a failed/interrupted smoke job using its saved lesson and audio.
npm run test:pipeline -- --resume JOB_ID

# Create a separate render revision using the same reviewed lesson and audio.
npm run test:pipeline -- --rerender JOB_ID
```

Smoke jobs and reports live in `.fair-video/smoke/JOB_ID/`. They are isolated
from the normal studio queue. To review them in the studio, start a separate
instance with `FAIR_DATA_DIR=.fair-video/smoke FAIR_PORT=4311 npm start`.
The default smoke target is 90 seconds; actual duration is reported without
speeding up narration or dropping teaching coverage. A completed smoke test is
a generated draft, not an educator approval.

Open-source generation now renders without ComfyUI by default. Add
`--version open-source --footage wan` to the normal generate command to request
an optional Wan establishing shot. Local Manim is detected automatically.
Use `FAIR_OPEN_MODEL` and `FAIR_OPEN_REVIEW_MODEL` to choose installed models.
Forced alignment measures word positions; it does not verify that the voice
actually spoke every approved word correctly.

To test actual Wan inference separately, start the installed worker with
`npm run start:comfy`, then run `npm run test:wan` after the lesson finishes.
This creates a small 512×288, 17-frame verification clip and records its actual
runtime and metadata. It is not a production-quality video benchmark.

## Curriculum data

`curriculum/cambridge-primary-maths-stage5.json` holds all 51 Cambridge Primary
Mathematics 0096 Stage 5 objectives grouped into 11 units and 49 generation
topics. Each topic carries its official objective codes, scope notes,
restrictions, prerequisites and suggested visuals. Objective wording follows
framework version 1.1 (September 2020); verify against a licensed centre copy
before publishing. Adding a board means adding a tree file — the pipeline does
not change.

## Models (all local, no per-use cost)

| Role            | Default                                  | Notes                              |
|-----------------|------------------------------------------|------------------------------------|
| Lesson planner  | `gpt-oss:20b` (Ollama)                   | `ollama pull gpt-oss:20b`          |
| Plan critic     | `qwen3:30b-a3b-instruct-2507`            | a *different* model is the point   |
| Teacher voice   | Qwen3-TTS VoiceDesign 8-bit (MLX)        | `content/voices/teacher.json`      |
| Draft voices    | Piper Indian-English, Kokoro, `say`      | faster, lower quality              |
| Renderer        | HyperFrames + GSAP + ffmpeg              | deterministic, no diffusion models |
| Optional intro  | Wan2.2 via ComfyUI (`open-source` ver.)  | euler sampler — see note below     |

## Honest limits

- Local models make mistakes. The pipeline repairs, validates arithmetic
  exactly, and cross-reviews with a second model — but **human review is the
  gate**, recorded per job in `review.json`.
- The designed teacher voice needs a listening check per batch; a fixed seed
  improves consistency but does not guarantee it across scripts.
- Wan2.2 footage is optional, silent and decorative only. On Apple Silicon the
  `uni_pc` sampler corrupts output; the pipeline enforces `euler`.
- The music bed ships as a synthesised placeholder. Add licence-audited tracks to
  `assets/audio/music-manifest.json` to replace it; the report always states which
  source was used.
- Interaction is currently in-video only: cards and a countdown, no clicking. The
  interactive lesson page (`public/lesson.html`) still runs on its own authored
  session file and is not yet generated from the same plan.
- Caption timing is word-accurate when the local forced aligner is installed
  (`FAIR_ALIGNMENT_MODEL_DIR`, already set in `.env`); visual reveals are still
  phrase-accurate until the beat contract lands.
- Curriculum objective wording is sourced from the published framework; confirm
  licensing terms for your use before redistribution.

## Layout

```
src/            pipeline: plan → voice → compose → render → verify
curriculum/     authored curriculum trees (board, stage, subject, topics)
content/voices/ designed-voice profiles
public/         studio UI + curriculum/review page
tools/          environment readiness check + teaching-pacing metrics
assets/audio/   licence-audited music beds and their manifest
scripts/        voice setup, Wan/ComfyUI helpers, benchmarks
test/           node --test suite (140 tests)
.fair-video/    per-run job directories with full provenance (git-ignored)
```

Ported and hardened from the `fair-video-studio` prototype in the LearningApp
repository.
