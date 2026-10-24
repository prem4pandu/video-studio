# Video Studio Roadmap

## Objective

Evolve Video Studio from a deterministic educational explainer generator into
a production-grade, open-weight educational cartoon studio without weakening
its existing curriculum, mathematical validation, provenance, or educator
review controls.

Generative models should remain bounded shot renderers. Exact equations,
labels, charts, captions, and other instructional content must continue to be
rendered deterministically.

```text
curriculum topic
  -> validated lesson plan
  -> production and shot plan
  -> renderer routing
  -> candidate generation and selection
  -> narration and forced alignment
  -> deterministic teaching overlays
  -> composition and automated QA
  -> educator approval
  -> publication
```

## Phase 0: Stabilize the baseline

**Target:** weeks 1-2

- Fix the open-source voice mismatch: readiness accepts `qwentts`, while the
  open renderer currently permits only Piper or Kokoro.
- Replace the ambiguous `reviewed` boolean with explicit validation states:
  schema-validated, deterministic-checks-passed, self-reviewed,
  cross-model-reviewed, and educator-approved.
- Add an end-to-end test for the default open-source configuration.
- Record runtime, peak memory, failure rate, retry count, and manual correction
  time for every pipeline stage.
- Add black-frame, frozen-frame, corrupt-frame, and silent-audio detection.
- Produce baseline videos for 5-10 representative curriculum topics.

**Exit criteria:** the current pipeline produces reviewable videos reliably,
all artifacts are hashed, and baseline quality and performance are recorded.

## Phase 1: Add a production-plan intermediate representation

**Target:** weeks 3-4

Keep the validated lesson JSON and add a renderer-independent
`production-plan.json`. Each shot should declare:

- instructional purpose;
- duration;
- characters, location, props, action, and emotional beat;
- dialogue speaker and canonical text;
- camera framing and movement;
- reference assets and continuity constraints;
- deterministic overlays;
- preferred renderer and fallback renderer.

Define one adapter lifecycle for every renderer:

```text
check readiness -> prepare -> generate candidates -> validate -> select -> finalize
```

Every adapter result must include the model and checkpoint, license, seed,
prompt, input hashes, dimensions, frame rate, runtime, hardware, output hash,
and validation results.

**Exit criteria:** the same production plan can use deterministic, Wan, LTX, or
Kandinsky renderers without changing lesson semantics, and work can resume at
the shot level.

## Phase 2: Build reusable characters and worlds

**Target:** weeks 5-6

Start with one teacher, one learner, one classroom, and a small prop set. Store
versioned assets for:

- turnarounds and approved reference images;
- expressions, poses, costumes, and mouth references;
- proportions, palette, distinctive features, and negative references;
- voice, pronunciation dictionary, personality, and teaching behavior;
- locations, recurring props, lighting, and visual style.

Use image-conditioned generation whenever character identity matters. Record
asset versions and hashes in shot provenance.

**Exit criteria:** each character remains recognizable across 20 independently
generated shots with stable costume, proportions, and palette.

## Phase 3: Upgrade Wan into a full shot renderer

**Target:** weeks 7-8

Extend the existing security-conscious ComfyUI adapter with:

- reference-image-conditioned image-to-video;
- first/last-frame conditioning where supported;
- Wan Animate for body motion and expression transfer;
- optional Wan S2V experiments for selected dialogue shots;
- 2-4 draft candidates per shot;
- draft, review, and final render profiles;
- contact sheets, caching, cancellation, and per-shot retry.

Use Wan for character movement, reactions, simple prop interaction, and
establishing shots. Never rely on it for equations, labels, captions, counted
objects, or worked answers.

**Exit criteria:** six to eight independently rendered shots form one coherent
sequence, and any failed shot can fall back or regenerate without restarting
the lesson.

## Phase 4: Add forced alignment and speech performance

**Target:** week 9

Build a shared timing source:

```text
canonical dialogue
  -> TTS
  -> forced alignment
  -> word, phoneme, and viseme timelines
  -> gestures, overlays, lip sync, and captions
```

Add speaker IDs, mathematical pronunciation overrides, line-level voice
regeneration, ASR comparison with the canonical script, and lip-sync scoring.
Compare speech-driven generation with post-process lip sync; retain off-screen
narration as the safe fallback.

**Exit criteria:** captions, mouth movement, gestures, and diagram reveals align
with measured speech, and a failed line can be repaired independently.

## Phase 5: Composite deterministic teaching graphics

**Target:** week 10

Keep equations, numbers, diagrams, charts, highlights, practice prompts, and
captions in Manim, SVG, Canvas, or HTML layers composited over generated
footage. Trigger overlays from forced-alignment phrases instead of proportional
timing estimates.

Extend the open renderer to cover the full lesson schema, including fraction
bars, bar models, area grids, angles, coordinates, charts, and clocks.

**Exit criteria:** all instructional content remains exact, legible, editable,
and independently replaceable without regenerating character footage.

## Phase 6: Add candidate evaluation and perceptual QA

**Target:** week 11

Validate individual shots for:

- character and reference similarity;
- prompt, action, camera, and duration compliance;
- flicker, frozen frames, abrupt background changes, and malformed anatomy;
- text contamination and unsafe imagery;
- resolution, frame rate, and container integrity.

Validate the assembled video for:

- shot-boundary continuity;
- overlay clipping and caption obstruction;
- black or duplicate frames;
- ASR/script agreement;
- integrated loudness, true peak, silence, and clipping;
- subtitle presence and expected duration.

Produce contact sheets, failed-frame thumbnails, QA reports, and candidate
rankings. Regenerate only the failed shot.

**Exit criteria:** invalid footage is blocked before educator review, with the
shot and frame range identified.

## Phase 7: Complete the 60-second benchmark

**Target:** week 12

Produce a benchmark containing:

- one teacher and one learner;
- two locations or visual setups;
- six to eight shots;
- spoken dialogue, physical action, and emotional reaction;
- one misconception and one worked example;
- one exact equation and one deterministic diagram;
- one learner question with at least three seconds of thinking time;
- an explained answer, captions, and recap.

Score the result as follows:

| Category | Weight |
| --- | ---: |
| Instructional correctness | 25% |
| Character and world continuity | 15% |
| Visual quality | 15% |
| Motion and acting | 10% |
| Narration and lip sync | 10% |
| Child engagement | 10% |
| Repeatability and editability | 10% |
| Compute cost and latency | 5% |

**Exit criteria:** no instructional errors or critical QA failures, at least
80/100 total quality, reproducible locked inputs, shot-level regeneration, and
educator approval.

## Phase 8: Add LTX-2.5 and Kandinsky 6 adapters

**Target:** months 4-5

Implement the same adapter contract for:

- **LTX-2.5:** rapid drafts, image-to-video, first/last-frame transitions,
  controlled motion, editing, and restoration.
- **Kandinsky 6:** short synchronized audiovisual scenes, environmental audio,
  and selected dialogue candidates.

Run a fixed 20-shot bake-off across Wan, LTX, and Kandinsky. Measure identity,
prompt compliance, motion, lip sync, runtime, VRAM, failure rate, storage, and
manual correction time.

**Exit criteria:** each model has evidence-backed winning shot categories and a
defined fallback. No model is required for every lesson.

## Phase 9: Scale production safely

**Target:** months 5-6

- Separate CPU and GPU worker queues.
- Use content-addressed caches and checkpoint-pinned artifacts.
- Persist shot-level job state and safe retry information.
- Generate previews first; render finals only after selection.
- Track compute and storage per approved minute.
- Add batch candidate and educator-review tools.
- Preserve educator approval as a mandatory publication gate.

Recommended lifecycle:

```text
planned
  -> validated
  -> audio-ready
  -> shots-drafted
  -> shots-selected
  -> shots-finalized
  -> composed
  -> automated-QA-passed
  -> educator-approved
  -> published
```

## Phase 10: Validate learning effectiveness

**Target:** month 6 onward

Compare the existing deterministic explainer, a hybrid cartoon lesson, and a
highly generative cartoon lesson. Measure completion, replay, question
accuracy, immediate improvement, delayed retention, child preference,
educator editing time, generation cost, and approval rate.

Retain cinematic elements only when they improve engagement or learning enough
to justify their operational cost. Prefer deterministic rendering when learner
outcomes are equivalent.

## First milestone

Do not begin with long episodes, many characters, custom model training,
real-time generation, automatic publishing, or every available model.

The first milestone is complete when Video Studio can repeatedly produce one
60-second educational cartoon with two consistent characters, six to eight
coherent shots, accurate narration, phrase-aligned animation, one
misconception, one practice question, exact deterministic mathematics,
reproducible artifacts, automated QA, and educator approval.
