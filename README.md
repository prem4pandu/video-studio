# Video Studio

A standalone, fully local concept-to-video studio for teaching. Give it a
teaching idea — or a node in a curriculum tree — and it plans a short lesson,
narrates it with a designed local voice, animates it deterministically, renders
an MP4 with captions, and holds it in a review queue until a teacher approves
it. No paid APIs are required anywhere in the pipeline.

Built for Apple Silicon. Every generated video is a **draft** until an educator
reviews it.

New dashboard, API, CLI and curriculum lessons default to the **KooBits-inspired
teaching film** (`quality`): hook → concept → worked example → guided practice
and feedback → misconception repair → independent transfer and feedback → recap.
This selects the approved proof-derived 1080p renderer; it is not a guarantee
that every generated lesson matches the reference quality. Review one lesson
before scaling. Unit/all-topic generation is paused in both the API and CLI.
Classic remains an explicit legacy option, never the default for new jobs.

## What it does

```
concept or curriculum topic
  → structured lesson plan   (local Ollama model, JSON-constrained, repaired)
  → deterministic checks     (exact arithmetic, coverage, cue timing)
  → independent critique     (a second model reviews the draft)
  → narration                (Qwen3-TTS VoiceDesign · Piper · Kokoro · say)
  → animation                (HyperFrames/GSAP deterministic scene renderers)
  → render + verify          (ffmpeg/ffprobe stream, duration, silence checks)
  → educator review queue    (approve / needs-changes / reject, with notes)
```

## Quick start

```bash
npm install
cp .env.example .env
npm run check:env        # reports what is installed and what is missing
npm run check:ui         # type-check and build the React studio
npm start                # studio UI → http://127.0.0.1:4310
```

- **Single concept**: open the studio, describe the lesson, generate.
- **Storyboard mode**: review the finished film beside its teaching plan,
  narration script, prompts, scene cards, and quality gates.
- **Advanced mode**: expose the detailed production timeline when diagnosing a
  run. On smaller screens the creation form becomes a guided, touch-friendly
  sequence while preserving the same lesson data.
- **Curriculum mode**: open `curriculum.html` (or the topbar link) to browse the
  Cambridge Primary Mathematics Stage 5 tree, generate per topic or unit, and
  work the review queue.

The web studio is React + TypeScript + Vite. `npm run dev:ui` starts the Vite
development server; `npm run build:ui` writes the production bundle to
`public/app/`, which the local Node server serves at `/`. The previous static
shell remains available at `/legacy.html` while its controller is migrated into
typed React modules.

## CLI

```bash
npm run generate -- "Teach rounding to the nearest whole number" --seconds 300
npm run topic -- s5-pv-rounding          # one curriculum topic → video
npm run batch -- --unit s5-place-value   # a whole unit, sequentially
npm run batch -- --all --only-pending    # resume the whole tree
npm run coverage                          # per-topic status report
```

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
- Curriculum objective wording is sourced from the published framework; confirm
  licensing terms for your use before redistribution.

## Layout

```
src/            pipeline: plan → voice → compose → render → verify
curriculum/     authored curriculum trees (board, stage, subject, topics)
content/voices/ designed-voice profiles
frontend/       React + TypeScript studio shell and responsive workspace
public/         built studio assets + curriculum/review page
tools/          environment readiness check
scripts/        voice setup, Wan/ComfyUI helpers, benchmarks
test/           node --test suite (135 tests)
.fair-video/    per-run job directories with full provenance (git-ignored)
```

Ported and hardened from the `fair-video-studio` prototype in the LearningApp
repository.
