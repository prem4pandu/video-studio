# Fair open-source content generation

This is a second generation version inside the existing **Content studio → Video Studio**. Select **Open-source video** in **Generation version**. **Classic lesson** remains the default, with its existing renderer, guides, provider choices and saved jobs.

## What this version generates

1. A configured local Ollama model creates the teaching plan. Set `FAIR_OPEN_REVIEW_MODEL` for a separate critic. The existing structural and arithmetic validation still applies.
2. Local Qwen3-TTS, Piper or Kokoro narrates the validated scenes. Paid and system voices are rejected for this version. Set `FAIR_ALIGNMENT_MODEL_DIR` to align the approved words locally with MLX Qwen3-ForcedAligner.
3. Optional: request `footage: "wan"` (CLI: `--footage wan`) to generate a short, silent establishing shot with Wan2.2 TI2V-5B through local ComfyUI. It is illustrative, not a mathematical demonstration. Its actual duration, capped at five seconds, is preserved. The default `footage: "none"` requires no ComfyUI service.
4. A trusted, JSON-driven Manim renderer draws the teaching scenes. It supports place-value columns, equations, comparisons, number lines, steps, recaps and base-ten grouping/trading/zero/expansion/multiplication. Question screens do not display the answer-bearing visual or title.
5. FFmpeg assembles the footage, teaching scenes, measured narration and subtitles. Captions are also burned into the teaching video. Verification checks streams, audible audio, duration and artifact hashes.

This version has no animated presenter, lip-sync or consistent-character promise. It does not generate a complete cartoon episode. Exports are drafts; a model critique and correct arithmetic checks do not establish teaching quality or factual accuracy in arbitrary prose or generated footage.

## MacBook setup

The implementation targets the user's Apple Silicon MacBook with 48 GiB unified memory. CUDA is not required by this integration. ComfyUI uses PyTorch MPS on Apple Silicon, but actual Wan speed, memory use and visual quality need a real render on the machine. A readiness check only establishes installed services, nodes and model filenames.

The isolated local directories are ignored by Git:

- `.fair-open/venv/` — Manim environment.
- `.fair-open/comfy/` — pinned ComfyUI checkout and model files.
- `.fair-open/comfy-venv/` — ComfyUI environment.
- `.fair-video/` — existing job store, including open-source jobs.

Use Python 3.12. Manim uses Pango text instead of executing LaTeX or model-generated code. On macOS, Cairo and pkgconf are needed to build pycairo if no wheel is available:

```sh
brew install cairo pkgconf
python3.12 -m venv .fair-open/venv
.fair-open/venv/bin/python -m pip install -r scripts/manim-requirements.txt
ollama pull qwen2.5:7b
```

Manim is pinned to 0.22.0 and its bundled environment is detected automatically. The normal open-source planner defaults to Qwen2.5 7B; choose another installed model with `FAIR_OPEN_MODEL` or `--model`. The separate critic uses `FAIR_OPEN_REVIEW_MODEL`, otherwise it defaults to the planner. Classic review settings are not inherited. The real smoke command uses the configured `FAIR_MODEL` (normally gpt-oss:20b) and a separate qwen3:30b critic.

ComfyUI is pinned to revision `3541246a9c997f4b8c32f9f88f3c985d02021c79` (v0.40.0). Keep all upstream notices. Its required model files are:

| ComfyUI directory | File | SHA-256 |
| --- | --- | --- |
| `models/diffusion_models/` | `wan2.2_ti2v_5B_fp16.safetensors` | `456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e` |
| `models/text_encoders/` | `umt5_xxl_fp16.safetensors` | `7b8850f1961e1cf8a77cca4c964a358d303f490833c6c087d0cff4b2f99db2af` |
| `models/vae/` | `wan2.2_vae.safetensors` | `e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156` |

Install the pinned ComfyUI environment and verified model files with:

```sh
npm run setup:comfy
npm run start:comfy
```

The setup command uses `.fair-open/comfy-venv` separately from Manim, resumes interrupted model downloads, and verifies every full model against its pinned SHA-256 before marking setup complete. Start ComfyUI in its own terminal and leave it running while generating. The start command enables MPS fallback and conservative FP32 diffusion/VAE settings with CPU text encoding configured below. These settings still need an actual render to establish visual quality and speed on a particular Mac.

Use the FP16 text encoder on CPU for this Mac configuration; the FP8 encoder is not the default. The model download is approximately 23 GB before runtime dependencies and outputs. No model weights are committed to the app repository.

Set these server-only values in `video-studio/.env`, using the actual absolute interpreter path:

```dotenv
FAIR_MANIM_PYTHON=/absolute/path/to/video-studio/.fair-open/venv/bin/python
FAIR_COMFYUI_URL=http://127.0.0.1:8188
FAIR_WAN_TEXT_ENCODER=umt5_xxl_fp16.safetensors
FAIR_WAN_TEXT_DEVICE=cpu
FAIR_WAN_WIDTH=512
FAIR_WAN_HEIGHT=288
FAIR_WAN_FRAMES=17
FAIR_WAN_FPS=24
FAIR_WAN_STEPS=20
```

These small settings are for an initial Mac verification clip, approximately 0.7 seconds. Increase duration only after measuring memory, speed and visual quality. Longer examples can use 41 frames at 8 fps (approximately five seconds); the generation parameters are recorded in provenance. The final lesson is assembled at 1280×720/30 fps, so a smaller Wan frame is upscaled for the establishing shot only. No native high-resolution quality is implied.

Keep ComfyUI bound to loopback with custom nodes disabled. This integration uses only a fixed graph of built-in nodes: UNETLoader, CLIPLoader, VAELoader, CLIPTextEncode, ModelSamplingSD3, Wan22ImageToVideoLatent, KSampler, VAEDecode, CreateVideo and SaveVideo. Browser requests cannot supply workflows, model paths, service URLs or commands.

Local Piper setup remains `node scripts/setup-voice.mjs`. Kokoro may use its existing local Python environment or a loopback endpoint ending in `/v1/audio/speech`. A separately configured remote Kokoro service remains a Classic option but is unavailable in this version.

## Run and diagnose

After starting Ollama (and ComfyUI only when requesting footage):

```sh
npm run check:open
npm start
```

From the Learning App root, the existing `pnpm dev:studio`/`pnpm start:studio` commands still apply. Reload Video Studio and use Refresh to update readiness. The worker caches configuration for up to 15 seconds. It must be restarted to load changes to `.env`.

CLI equivalent:

```sh
npm run generate -- "Teach place value." --version open-source --voice qwentts --seconds 90
```

Readiness lists concrete blockers. A missing model, runtime error, cancelled job or failed content check never becomes a successful export. No paid-provider or upstream-production fallback exists.

## Saved jobs, retries and downloads

Each job stores `brief.generationVersion`. Old jobs without this field are Classic. Retries retain the selected version and reuse only hash-verified plan, speech and footage artifacts. Wan request IDs are persisted before submission to avoid silently submitting a second GPU job after an ambiguous network failure.

Cancellation stops the lesson worker and removes only its own queued Wan request. An already-running ComfyUI task can continue; it is not interrupted globally because the worker may serve other jobs. A retry can resume that task. If a request's status cannot be established, inspect ComfyUI history before removing its request record; the adapter fails rather than silently repeating work.

Downloads include MP4, WebVTT, transcript, lesson, prompts, quality report, Manim Python source, render-plan JSON and Wan provenance. Re-rendering from source requires the full local project directory, including audio and footage assets. The manifest records hashes. Sources and metadata pass through the existing authenticated author/admin proxy; raw worker files and secrets remain inaccessible.

Package publication remains a separate educator-reviewed workflow. The existing local studio is still a shared single-user/staff workspace, not a multi-tenant rendering service.

## Licenses and sources

- [Wan2.2](https://github.com/Wan-Video/Wan2.2): Apache-2.0; [official ComfyUI workflow documentation](https://docs.comfy.org/tutorials/video/wan/wan2_2).
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI): GPL-3.0. The API graph in this repository is independently authored from documented interfaces.
- [Qwen2.5 7B Instruct](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct): Apache-2.0.
- [Manim Community](https://github.com/ManimCommunity/manim): MIT.
- Existing Piper Indian-English model: AGPL-3.0; Piper runtime: GPL-3.0. Existing Kokoro model: Apache-2.0, with runtime notices retained separately.
- FFmpeg licensing depends on its build options; the renderer uses libx264. Preserve the installed build's applicable notices and distribution obligations.

No LTX model or proprietary paid-generation API is used by this version. Open-source licensing does not remove hardware, storage or electricity costs.

## Verification

```sh
npm test
npm run check
FAIR_MANIM_PYTHON="$PWD/.fair-open/venv/bin/python" node --test test/open-render.test.mjs
```

The test suite distinguishes HTTP fixtures, FFmpeg assembly fixtures and actual Manim renders. A synthetic clip in a contract test is not evidence of successful Wan inference. For the real model-to-MP4 smoke test, install the pinned aligner with `.fair-neural/qwen-venv/bin/python scripts/setup-alignment.py`, then run `npm run test:pipeline`. Evidence and stage timings are recorded under `.fair-video/smoke/JOB_ID/`. Forced alignment locates approved words; it does not independently verify spoken-script accuracy. Actual Wan generation remains a separate optional test.


### Local pipeline test — 20 October 2026

- A real gpt-oss:20b plan passed a separate qwen3:30b teaching critique. The initial Qwen2.5 7B attempt failed structural validation and was retained as a failed job.
- Qwen3-TTS generated seven narration scenes; all words were aligned locally with the pinned Apache-2.0 Qwen3-ForcedAligner checkpoint. The aligner does not independently verify spoken content.
- Manim and FFmpeg exported a 61.467-second, 1280×720, 30 fps draft with burned-in and embedded captions, a five-second practice pause and complete declared objective coverage. Media, timing, audio and hash checks passed.
- The first live run exposed a reviewer ambiguity around the internal `expanded` mode, an oversized system warning, and curly-apostrophe alignment handling. These were fixed. The warning-only repair is recorded alongside unchanged raw generation records.
- Frame inspection caught missing glyphs for non-breaking hyphens. A separate corrected render revision preserves the initial export and records its parent job.
- Corrected pilot: `.fair-video/smoke/4cee8d6c-6505-4226-9c71-919057eb1876/project/lesson.mp4`. Its render revision reused reviewed content and aligned audio and took 18.08 seconds; this is not full cold-generation latency.
- A real, uncached Wan2.2 TI2V-5B test generated 17 frames at 512×288/24 fps in 148.48 seconds. Container verification passed, but frame inspection found heavily distorted output. Its visual review is `needs-changes`; it is not used in the pilot. Native-resolution production quality remains unvalidated.
- Wan evidence: `.fair-video/wan-smoke-Pr3HYr/smoke-report.json` and `frame.png`.
- The automated suite passed all 140 tests with real Manim enabled and no skips. The pilot remains pending educator and voice listening review. Its sparse visual presentation is a technical baseline, not the finished design target.

Historical verification during the earlier implementation:

- 129 studio tests passed, with real Manim and FFmpeg checks enabled; no skipped tests.
- Learning App proxy integration tests (10), web typecheck and production build passed.
- Desktop and mobile browser checks passed, including narrator selection after Refresh and truthful setup blockers.
- A real Qwen2.5 7B place-value draft passed its own model critique but was rejected during manual review for a false unit-equivalence statement. Its repair and a separate comparison draft failed validation. The generated draft was explicitly marked unreviewed and was not exported. These failures demonstrate why model critique cannot replace educator review.
- Local Piper produced seven real narration tracks, totaling 48.762 seconds. This verifies local speech, not correctness of the rejected lesson.
- Wan inference remains pending until model downloads and the actual Mac render complete.
