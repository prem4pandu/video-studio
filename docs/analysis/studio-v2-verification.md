# Studio V2 verification — 1 November 2026

The local prompt-to-video workflow is implemented and the three exports below passed the recorded technical, visual and content checks. Every export remains a draft requiring human editorial review; none has educator approval or monetization certification.

Open [Studio V2 in Chrome](http://localhost:4320/app/#/studio-v2). Accepted productions are stored in `.fair-video/studio-v2`. The earlier studio remains available separately. A normal future `npm start` uses the same V2 library under the default data directory.

## Verified exports

| Mode | Actual duration | Delivery | Independent speech check | Export |
|---|---|---|---|---|
| learning | 57.1s (45s target) | 1920×1080, 30 fps | 142 words / 3 ASR differences | [MP4](http://localhost:4320/api/v2/jobs/4d0d1627-68bf-4118-91d3-ae347874e0cf/artifacts/video) |
| social | 23.5s (30s target) | 1080×1920, 30 fps | 55 words / 0 ASR differences | [MP4](http://localhost:4320/api/v2/jobs/5b0f7cc6-9ca2-4659-833f-5165ef4730fa/artifacts/video) |
| story | 33.7s (30s target) | 1920×1080, 30 fps | 81 words / 1 ASR differences | [MP4](http://localhost:4320/api/v2/jobs/7c9ec21d-a440-49ea-81a9-11d69c563fd1/artifacts/video) |

The lesson's three transcription differences are “whole” → “hole” homophones. The story has one “strong” → “stronger” recognition difference. Social speech matched all normalized words. Whisper received no script prompt and ran from cached local weights. ASR is fallible and does not establish voice naturalness; no human listening review is claimed.

The lesson exceeds its approximate 45-second target and its quality report discloses that. Speech was preserved instead of being cut or sped up. Future generation has tighter per-scene word limits.

## What was inspected

- Learning: correct half definitions; exact circular fractions; equal and unequal portions with conserved whole width; an unanswered question held through four thinking seconds; an immediate matching answer; readable, unclipped captions and labels.
- Social: portrait-safe text, visible opening content, three concrete desk actions and a final challenge. It is an animated typography explainer with abstract illustrations.
- Story: seed, storm-damaged drooping plant, care, and flowering states match the narration. The final storm frame has no inappropriate sun icon. It is a bounded vector illustration story.
- All three: complete FFmpeg decode, H.264 video with AAC audio, 30 fps, correct dimensions, no detected black intervals, complete ordered captions, measured timeline duration, and integrated loudness around −16 LUFS.
- Low-motion holds were measured and reviewed in context. The lesson includes a deliberate question pause; a freeze detector is not treated as a creativity score.

Question/answer construction and mathematical annotations are deterministic from validated quantities. The model supplies the remaining script and structured scene plan, never executable rendering code. The lesson and story received the different-model `gpt-oss:20b` critique. The accepted social sample retains its earlier same-model critique warning and also received agent semantic review. New jobs default to Qwen3 planning with reasoning and a separate GPT-OSS critic.

The last learning and story visual fixes were re-rendered through the full OpenMontage pipeline with saved reviewed plans. Plan hashes and every narration audio hash were checked unchanged. Original test drafts and evidence are retained under `outputs/studio-v2-tests`; rejected drafts are not part of the accepted library.

## Verification evidence

Environment: local macOS on Apple Silicon, Node 24, Python 3.12, FFmpeg 9, local Ollama/Kokoro/alignment, HyperFrames 0.8.161.

| Command or check | Exit | Result |
|---|---:|---|
| `npm run check` | 0 | Repository JavaScript syntax checks passed |
| `npm test` | 0 | 228 passed; one optional real-Manim test skipped because its interpreter was not configured |
| `flutter analyze` in `app` | 0 | No issues |
| `flutter test` in `app` | 0 | 12 passed, including 375px layout and review states |
| `flutter build web --base-href /app/` | 0 | Fresh web build served locally |
| `node scripts/verify-studio-v2-video.mjs <project>` | 0 | All three actual exports passed decode/media checks |
| Local ASR environment running `scripts/verify-studio-v2-speech.py <project>` | 0 | Independent transcripts and per-scene audio hashes recorded |
| Real artifact HTTP requests | — | MP4 range returned 206; first 1,024 bytes matched the file; caption/transcript/metadata/report downloads returned 200 |
| Native CUA Chrome verification | — | Readiness and production pages loaded; video played with audio and advancing time, paused; Retry changed failed production to queued |

Node log: [full test output](../../outputs/studio-v2-tests/node-tests-final.log). Machine-readable summary: [final verification](../../outputs/studio-v2-tests/final-verification.json). Each accepted project includes `quality-report.json`, `media-inspection.json`, `independent-speech-review.json`, contact sheets, captions, transcript, metadata, and provenance.

Queue/idempotency, conflicting request keys, cancellation and descendant cleanup, timeout, restart recovery, late completion after cancellation, review gating, unsafe origins, artifact containment, byte ranges, content rejection, and failed model responses have regression coverage.

## Boundaries

Chrome is verified. Safari produced a blank app during native testing and remains an unresolved compatibility issue; use Chrome. The app now has explicit local CanvasKit loading and visible startup-error feedback.

This release supports narrated learning diagrams, social explainers and a bounded illustration vocabulary. Arbitrary cinematic footage, general character animation, live fact research, automatic posting, and guaranteed platform revenue are not implemented or claimed. Factual sources, voice/model licences and publication rights still need review. Automated critics missed errors during development; deterministic guards and direct inspection caught the issues documented here, so human review remains required.

The actual pinned OpenMontage `HyperFramesCompose.render_existing` tool performs check/render. Its source is AGPL-3.0 at commit `195eab24478dc9363326aec437aefc3701635ddf`; compatibility adjustments and provenance are documented in [the worker README](../../studio-v2/worker/README.md). Review applicable licence obligations before distributing or hosting this integration. No paid media API was used.
