# Studio V2 — OpenMontage prompt-to-video

Authorized implementation, 2026-11-01. Separate V2 route and API, shared existing Flutter shell. Local single-user deployment on the current Mac.

## Product

Prompt → classify learning/social/story → generate structured script and scene plan → critique and bounded repair → local narration and word alignment → original animated scenes and music → OpenMontage check/render → media verification → review/download.

One primary prompt field; optional mode, landscape/portrait, duration and style. Defaults remain local and make no paid provider calls. Deliver MP4, captions, transcript, thumbnail, metadata and transparent quality report. Completion means generated draft; educator/content approval is a separate action. No automatic publishing or earnings guarantee.

## Boundaries

- Existing studio remains available; `/api/v2` uses an independent durable job directory.
- Node owns queue, validated schemas, cancellation, idempotency, retry and state persistence.
- Local LLM produces bounded scene contracts, not executable model-supplied code. Original renderer compiles those contracts into HyperFrames workspaces.
- OpenMontage pinned checkout and Python adapter own actual HyperFrames render operation; no silent renderer fallback.
- Reuse existing neural narration/alignment and exact arithmetic validator.
- Generated code/media remains in job workspaces. No unrestricted agent shell or external secret access.
- First release covers diagram-led learning, animated social explainers and illustrated stories. Photorealistic cinematography, arbitrary 3D worlds, celebrity avatars and fully autonomous fact research are not claimed.

## Work lanes

Root: contracts, planner/critic, job lifecycle, API integration, pipeline QC, full E2E validation, documentation.
UI agent: Flutter V2 pages, playback/downloads/review, loading/error/readiness, tests/build.
Renderer agent: timeline compiler, SVG animation and motifs, portrait/landscape layouts, captions/audio, geometry tests.
Worker agent: pinned persistent OpenMontage setup, offline local CLI bridge, timeout/cancellation/provenance, tests.

## Release gates

1. Fresh prompts generate real learning, social and story videos without manual scene/script edits.
2. Generated scripts/geometry satisfy schema, arithmetic and question/pause checks; unsafe payloads remain text.
3. Runtime/layout/contrast and media duration/audio checks pass. Motion measures are contextual, not a substitute for readability or correctness.
4. Duplicate create, cancellation, retry, restart recovery, corrupt/missing artifacts and failed providers are tested.
5. Flutter analysis/tests/build and Node checks/tests pass; UI checked in browser including narrow viewport and video playback.
6. Representative rendered frames inspected, audio measured, claims about tests match saved evidence.
7. Readiness reports genuine installed dependencies; setup/version/license details documented.

AGPL upstream remains identified and separate. Distribution/hosting licensing decisions require review before a commercial hosted release. Social platform eligibility depends on original content, rights and account/platform rules; the studio exports material for human review, not a monetization certification.
