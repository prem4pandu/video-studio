# Strategy: making the teaching videos powerful

Analysis date: 2026-10-22. Basis: full read of `src/`, the 148-test suite
(147 pass, 1 skipped), a frame-by-frame audit of three rendered lessons, and
`tools/fair-teaching-metrics.mjs` (added with this document — read-only, run it
on any `project/` directory).

The short version: **this pipeline's moat is its instructional control system,
and its ceiling is that the video layer is a slide deck with fades.** The next
step is not better models, more visual kinds, or generated footage. It is to
change the atomic unit of design from *a scene with a picture* to *a beat with a
change* — and then to prove, automatically, that the screen changed when the
voice said it would.

---

## 1. What is actually built

```
brief / curriculum topic
  → planner        LLM writes lesson JSON against a strict zod + JSON-schema contract  (fair-plan.mjs)
  → validators     schema, arithmetic in a bounded grammar, beat-arc coverage, cue legality
  → critic         a second model reviews the draft; errors force targeted scene repair
  → narration      Qwen3-TTS VoiceDesign (or Piper/Kokoro/say), per-scene WAV + phrase timings
  → composition    HTML/GSAP scene per beat, captions, HyperFrames check
  → render         HyperFrames → MP4, ffprobe/volumedetect verification
  → review queue   approve / needs-changes / reject, never auto-published
```

Two composition paths exist and diverge:

| Path | Used when | Resolution | Animation |
|---|---|---|---|
| `fairFilmCompose` (`fair-film.mjs`) | any `base-ten` visual, or `avatar: none` | 1920×1080 | `fairBaseTenAnimation` only; everything else is one fade (`fair-film.mjs:49`) |
| `fairCompose` (`fair-composition.mjs`) | otherwise | 1280×720 | 14 static templates + bespoke fragments for `fraction-bars`/fraction `comparison` |
| `fair-open-render.mjs` | `generationVersion: open-source` | Manim | 6 kinds |

What is genuinely strong, and should be protected:

- **The explanation architecture is demanded by the contract**, not hoped for:
  `hook → concept → example → misconception → question → answer → recap` is
  enforced (`fair-plan.mjs:313`), every objective must be both explained and
  practised (`:312`), questions need ≥3 s of thinking time (`:255`), and answers
  must immediately follow their question (`:253`).
- **Arithmetic is verified, not trusted** — a bounded expression grammar with
  rational arithmetic (`:166-209`), plus a scanner that checks every `a = b`
  that appears in a title or visual (`:299-306`).
- **A different model reviews the writer's draft** and blocks the render.
- **The output is gated on measured artefacts**: streams, duration, non-silence,
  captions (`fair-pipeline.mjs:86-96`).

That combination is rare and is the reason this project beats a normal
AI-video tool on *teaching*. Everything below extends it; none of it trades it
away.

---

## 2. The measured ceiling

`tools/fair-teaching-metrics.mjs` reads the composition the pipeline emitted and
counts content changes (excluding mouth/pose/pause chrome) against scene time.

### The authored fraction benchmark (`outputs/equivalent-fractions-age-9-10-qwen-v3`)

```
duration 174.2s · 10 scenes · 53 content changes
scene                kind               dur  words  chg   last   still    gap
hook                 fraction-bars     20.9     43   10    7.5 13.3s/64%   13.3
equal-parts          steps             13.8     29    1    0.0 13.8s/100%  13.8
repartition-half     fraction-bars     19.3     39    9    7.7 11.6s/60%   11.6
repartition-thirds   fraction-bars     17.2     34    9    6.8 10.4s/60%   10.4
denominator-trap     comparison        17.9     38    3    7.7 10.3s/57%   10.3
practice             recap             20.7     26    1    0.0 20.7s/100%  20.7
practice-answer      fraction-bars     13.3     30    9    5.6  7.7s/58%    7.7
transfer-question    recap             21.2     30    1    0.0 21.2s/100%  21.2
transfer-answer      fraction-bars     13.1     26    9    5.5  7.6s/58%    7.6
retrieval            recap             16.7     38    1    0.0 16.7s/100%  16.7
```

- **76 % of the runtime is a frozen picture** after the last change.
- Four scenes are one single reveal: the entire 20.7 s practice question appears
  at t=0 and never moves again.
- Worst frozen interval: **21.2 s**.

### A place-value lesson on the film path

- 82 % static; one scene runs **33.2 s with exactly one visual change**.
- `hook`, `concept`, `example`, `misconception`, `a1`, `a2`, `a3`, `recap` are
  all one-shot.

### The exception that proves the point

The same audit on a lesson containing `base-ten` scenes:

```
concept        base-ten  10.3s  96 changes  last@6.1s  gap 4.2s
misconception  base-ten  13.9s   7 changes  last@10.1s gap 7.3s
```

`base-ten` is the only visual kind with a state machine
(`fair-base-ten.mjs` → `fair-discovery.mjs` / `fair-animation.mjs`): objects,
then a transformation, then notation, each bound to a spoken beat. It is also
the only kind whose motion is tied to words (`fair-animation.mjs:6`,
`fair-plan.mjs:137`). The 76 %/82 % numbers are not a renderer limitation — they
are the cost of the other 13 kinds having no timeline of their own.

### Three specific defects this produces

1. **Timing is allocated by word count, not by meaning.** Generic reveals are
   spaced `start + 0.25 + i * min(2, speech/(items+1))`
   (`fair-composition.mjs:161`) — capped at 2 s per element, so long scenes
   compress every element into the opening seconds and then freeze. The
   repartition "change" is hard-coded to 42 % of narration
   (`fair-composition.mjs:164`). Measured effect: recap items are on screen
   **1–4 s before** they are spoken.
2. **The hook gives the answer away.** Hook narration asks for a prediction at
   ~9.5 s; the ×2 split and the finished `2/4` bar are drawn at **6.6 s**
   (`fair-composition.mjs:164` again). The 4 s thinking pause then plays over the
   completed answer. The single most valuable moment in the lesson — a
   child committing to a guess — is spent looking at the solution.
   Frame: `outputs/analysis/hook-answer-at-8s.png` (caption still on
   "keep the shaded amount exactly where it is").
3. **Reveals run ahead of speech.** At 165 s in the same render, all four recap
   items are already listed while the voice is still on item one
   (`outputs/analysis/recap-all-revealed-at-165s.png`). Consistent across scenes:
   a 2 s-per-element stagger describes the word count, not the argument.

Also unused, already-built capability: `fair-film.mjs:44-45` stores
`visualCues` and `visualProof` (the animation's own before/after evidence) on
every scene, and nothing ever reads them. Forced alignment is written, cached and
validated (`fair-alignment.mjs`) but off unless `FAIR_ALIGNMENT_MODEL_DIR` is set
(`fair-voice.mjs:126`). Only 2 of the 12 job directories on disk used it; every
authored-benchmark render — including the one scored against KooBits — carries
`wordTimingSource: "estimated"`.

---

## 3. The strategy

### 3.1 The one-line thesis

> Every spoken sentence that teaches must be paired with a change on screen,
> and that change must land on the word. A lesson is not a list of scenes; it is
> a sequence of *look* → *change* → *so what* beats.

The pipeline already knows how to do this for exactly one visual kind. The
strategy is to promote that mechanism to the core contract and rebuild the
catalogue on top of it.

### 3.2 The beat contract (schema)

Replace "scene = narration + one visual" with "scene = 2–6 beats":

```jsonc
{
  "id": "repartition-half",
  "beat": "example",
  "title": "Repartition without changing the amount",
  "visual": { "archetype": "partition-bar", "whole": 1, "parts": 2, "shade": [1] },
  "beats": [
    { "say": "Start with one half.",                 "change": { "op": "show-bar", "shade": 1 } },
    { "say": "Split every half into two equal pieces.", "change": { "op": "partition", "factor": 2 }, "preserves": "shaded-length" },
    { "say": "So one half equals two fourths.",       "change": { "op": "reveal-notation", "left": "1/2", "right": "2/4" } }
  ]
}
```

Rules, all machine-checkable:

- `say` must occur **exactly once** in the scene's narration — this validator
  already exists as `baseTenCueWordOffsets` (`fair-plan.mjs:137`) and just needs
  generalising.
- Beats compile in narration order, with cues carrying a word index (not a
  timestamp).
- One `change` per beat; a change must move something the sentence actually
  names. Anything else is decoration and is rejected.
- Every change declares `preserves` (`shaded-length`, `total`, `whole`, `angle`)
  when it is a preserving transformation, and the renderer keeps a **persistent
  invariant anchor** on screen while everything else moves. This is the single
  most powerful animation primitive in mathematics teaching — *watch what does
  not change* — and the codebase already has a hint of it in `shade-endpoint`
  (`fair-composition.mjs:42`, `:165`).
- Pacing budget: ≥1 change per 12 spoken words, never more than 4 s without a
  change, ≤35 words per beat.

**Why this fixes explanation, not just animation:** a paragraph can describe a
transformation; a beat *forces* the writer to name one. The planner currently
writes 26–43 words per visual state. Under the beat contract the same words must
be distributed across 3–6 changes, which is exactly the "explain as you go"
rhythm the KooBits comparison scored 9/10.

### 3.3 A persistent model and a small op vocabulary

Today the 14 visual kinds are independent templates with no state, no memory
across scenes, and no shared geometry (`fair-composition.mjs:54-113`). Replace
them with one scene graph per lesson and a short op list:

| op | meaning | used by |
|---|---|---|
| `partition(factor)` | split every part k times, boundaries stay equal | fractions, percentages, decimals, area |
| `shade(parts)` | move the shaded set | fraction/decimal/percentage meaning |
| `bundle(10)` / `trade` | ones↔tens↔hundreds | place value (already implemented) |
| `align` | put two wholes on one scale | comparison, misconception |
| `count(values)` | enumerate with spoken numerals | counting, place value |
| `map` / `label` | attach a name or number to an object | notation, coordinates |
| `reveal-notation` | connect picture to symbols | every abstract step |
| `slide` / `jump` | move along a rail | number line, rounding, negative numbers |
| `turn(degrees)` | rotate a ray | angles, time |
| `compare-endpoints` | hold two endpoints up to each other | equivalence, inequality |

All geometry is derived from **validated state**, never invented by the model —
that discipline already exists (`fairBaseTenState`, `renderedBaseTenState`) and
is why base-ten output is trustworthy.

Three archetypes cover most of Stage 5 and each is one state machine:

1. **`partition-bar`** — fractions, equivalence, decimals, percentages, area
   models. *Ship this first: it is the benchmarked one.*
2. **`place-value`** — already the best code in the repo; migrate it onto the
   shared graph rather than rewriting it.
3. **`number-line-rail`** — ordering, rounding, negatives, time, measures; plus
   `turn` for angles.

Consequences, all of them things the current output lacks:

- **Continuity.** Props live across scene boundaries, so "paper strip → bar →
  symbols" is one object changing form instead of three disconnected slides.
  (`fair-film.mjs:43` already fakes this with a `continueObjects` flag — that
  hack becomes unnecessary.)
- **Variety without new templates.** `partition` + `align` + `reveal-notation`
  in different framings is visually fresh; five fraction-bar cards in ten scenes
  (current output) is not.
- **Repair clips.** A wrong multiple-choice option can render its own 2-beat
  repair from the same model, and the interactive session schema
  (`fair-learning-session.mjs`) can point at it.

### 3.4 Sync by default

Turn forced alignment on for every real render (`FAIR_ALIGNMENT_MODEL_DIR`; the
1.28 GB Apache-2.0 aligner, setup script, caching and validation already exist).
Then compile `cue word index → aligned word time → GSAP position` for **all**
kinds, not just base-ten (`fair-animation.mjs:6`).

Gate: each beat's change must land within ±200 ms of its cue word (p95 ≤250 ms);
fail the render otherwise. Add a small "sync audit" line to
`quality-report.json` so it is visible per job.

This alone removes the 1–4 s early reveals, and it changes the *perceived*
quality more than any other single change, because motion that lands on the
voice reads as intentional instead of as a slideshow.

### 3.5 Explanation upgrades that are cheap and high-yield

These are planner/validator changes, no renderer work:

1. **Prediction gate** (fixes the hook defect): no reveal until after the
   prediction prompt; the thinking pause shows the *question and two options*
   with a countdown, then the answer appears on the reveal word.
2. **Invariant sentence** — one sentence per transformation stating what did not
   change, with the anchor visible while it is said.
3. **Contrast pair** — the misconception scene must render both cases on one
   shared scale and animate the mismatch (`denominator-trap` is close, but the
   mismatch is asserted in text, not shown as a measured difference).
4. **Representation ladder (CPA)** — concrete → pictorial → symbolic, same
   object, three beats. The current plan has a `concept.analogy` string that
   never becomes an image; make the analogy a required *rendered* step or find
   a different hook.
5. **Worked-example fading** — worked → completion → independent. The current arc
   jumps from one worked example to a fully independent transfer question.
6. **Question cards, not paragraphs.** `fairQuestionCard` (`fair-question-card.mjs:21`)
   only fires on one sentence pattern; visual options exist for fraction bars
   (`fair-composition.mjs:51`) but not generally. Generalise: every question
   renders as a designed prompt with visual answer choices.

### 3.6 Production multipliers (small effort, large perceived gain)

| Change | Why it matters | Effort |
|---|---|---|
| **Audio design**: a −18 dB music bed with side-chain ducking, plus 3–6 designed SFX on change beats | There is currently **zero** non-voice audio. Silence between scenes is the loudest tell of an automated video. Mix with ffmpeg post-render (`amix` + `sidechaincompress`) — deterministic, local, licence-clean. | 3–5 days |
| **Cut on the beat, not on the clock** | Every scene currently hard-cuts after `speech + pause + 0.7 s`. Cut on a beat boundary and hold 0.3 s. | 1 day |
| **Two framings per scene** (establish → close-up on the operated region) | `closeup: true` exists in `fair-discovery.mjs:132` and only toggles a CSS class. Real reframing adds energy and signals "look here". | 2–3 days |
| **1080p for the classic path** | Output is 1280×720 while the film path is 1920×1080; text is the instruction medium. One composition attribute. | hours |
| **One identity** | Two diverging composers duplicate timing, caption and audio logic (`fair-composition.mjs` vs `fair-film.mjs`); a fix in one never reaches the other. Consolidate on the film path + archetypes. | with 3.3 |
| **Guide reacts only at predict / reveal / repair** | Pose logic is energy-driven (`fair-film.mjs:52`); make it event-driven. | 1 day |
| **Contact sheet in the report** | 1 frame per beat in `quality-report.json` makes review 10× faster and catches spoilers automatically. | 1 day |

### 3.7 Close the loop: measure what the review complains about

The verification stack proves the maths is right and the file plays. It cannot
currently tell you that the animation failed to show the thing being said.
Extend it:

1. **Pacing gates** (already implemented in `tools/fair-teaching-metrics.mjs`):
   still-picture ≤40 % of runtime, longest frozen interval ≤4 s, zero one-shot
   scenes, ≥8 changes/minute. Wire into `test:pipeline` and
   `quality-report.json`.
2. **Sync gate**: measured cue error, p50/p95.
3. **Proof gate**: every `preserves` claim asserted against the rendered state
   (the `proof` array from `fair-discovery.mjs` is already produced and thrown
   away — assert it).
4. **Referent gate**: every noun the narration names in a beat exists in the
   scene graph, and appears at that beat.
5. **ASR round-trip** (prototyped in the decimal pilot): transcribe the final
   MP4 without prompting and diff against the script; catches dropped or
   mangled numbers, and yields true caption timings.
6. **Golden frames per archetype**: hash the rendered beat frames of an approved
   lesson; a refactor that shifts geometry fails loudly.

Human review stays the final gate for taste and pedagogy. Everything above is
mechanical, and mechanical gates are what let you scale to 49 topics without
quality drift.

---

## 4. Sequencing

| Phase | Work | Gate to pass |
|---|---|---|
| **0 — days** | alignment on by default; reveal timing bound to words for existing kinds; stop the hook spoiler; 1080p; contact sheet | re-render the fraction benchmark: still-picture <60 %, no reveal >1 s early |
| **1 — 1–2 wks** | beat contract + cue compiler generalised to `fraction-bars`, `steps`/`recap`, `comparison`; pacing validator | still-picture <35 %, longest frozen <6 s, zero one-shot scenes |
| **2 — 2–3 wks** | persistent model + `partition-bar` archetype: fold → repartition → scaling → align-compare, with invariant anchors | the "surpass KooBits" render from `outputs/koobits-vs-our-equivalent-fractions-review.md` |
| **3 — 2–3 wks** | audio bed + SFX; transitions; reframing; planner explanation fields (invariant, contrast, CPA ladder, fading) with validators | animation explanation ≥8.5 / presentation ≥8.3 on the existing scorecard |
| **4 — ongoing** | migrate `place-value` onto the model; add `number-line-rail` + `turn`; curriculum `suggestedVisuals` → archetype mapping; per-archetype goldens; batch QC dashboard | 49 topics at a stable quality floor |

Recommended immediate pilot: **equivalent fractions**, because the benchmark,
the competitor analysis, and the strongest existing animation code all point at
it. Ship phase 1 on that one lesson and compare frames side by side with
`equivalent-fractions-age-9-10-qwen-v3-white-pointers.mp4` before touching the
other 48 topics.

---

## 5. What not to do

- **Don't add more static visual kinds.** Fourteen exist; twelve have no
  choreography. Adding a fifteenth multiplies surface area without adding a
  beat.
- **Don't chase live action, diffusion footage or lip sync.** Wan is already
  described as "silent and decorative only"; lip sync would add a failure mode
  and break determinism for no learning gain.
- **Don't make the planner smarter first.** Better prose over a frozen diagram
  is still a frozen diagram. The beat layer is what makes better prose pay off.
- **Don't gate aesthetics with an LLM judge.** The critic loop is valuable for
  factual and structural errors; for visuals, gate on geometry and timing,
  and keep the human for taste. LLM reviewers are noisy on "is this beautiful"
  and would cause repair loops that damage correct lessons.
- **Don't abandon the review queue** to gain throughput. It is the reason the
  output is usable in a classroom at all.

---

## 6. Expected outcome on the existing scorecard

From `outputs/koobits-vs-our-equivalent-fractions-review.md`, using its own
dimensions:

| Dimension | Now | After phase 1 | After phase 3 |
|---|---:|---:|---:|
| Animation explanation | 6 | 7.5 | 8.5–9 |
| Visual variety | 5 | 6.5 | 8 |
| Real-world hook | 5 | 6.5 | 8 (paper-fold archetype, rendered) |
| Presentation + animation | 6.1 | 7.1 | 8.3 |
| Teaching architecture | 8.6 | 8.8 | 9.0 (kept, not traded) |

The teaching architecture is already ahead. The strategy is simply to stop
spending the runtime on still frames, and to make the picture move on the words.

---

## 7. Phase A — built and measured (2026-10-22)

Shipped in this repository, on top of the contract described above:

- `src/fair-audio.mjs` — seeded, deterministic sound-effect synthesis; licence-audited
  bed selection from `assets/audio/music-manifest.json`; one mix graph that
  normalises the voice, ducks the bed under it, thins the bed during answer-free
  pauses, limits and lands a single loudness target.
- `src/fair-intro.mjs` — beat-aligned title card ("today we'll be able to…") and a
  closing rule card. No narration, so they cannot disturb measured speech timing.
- `src/fair-interaction.mjs` — derives `predict` / `choose` nodes from the lesson
  itself. Rendered now as option cards plus a countdown ring; the same nodes are
  what a clickable player will consume later.
- Composer — 1080p output (authored at 1280×720 and scaled, matching the film
  renderer), the hook answer withheld, hook prediction chips, phrase-synced
  reveals for lists and for the repartition/comparison choreography, an invariant
  callback near the end of each example, and the countdown pill placed in the
  caption band where no narration runs.
- Pipeline — renders `lesson-voice.mp4` first, then mixes to `lesson.mp4`, so the
  music-free cut survives as a deliverable and as a re-mix source; the quality
  report and `audio-mix.json` record the bed's source, licence and the exact
  filter graph.
- Tools — `npm run metrics` (pacing audit), `npm run recompose` (rebuild the
  composition only), `npm run render:phase-a` (the benchmark render).

Measured on the same equivalent-fractions lesson (v3 → v4, `npm run metrics`):

| Metric | v3 | v4 |
|---|---:|---:|
| Still-picture share of runtime | 76 % | 12 % |
| Content changes per minute | 18.3 | 23 |
| Scenes with at most one change | 4 | 0 |
| Longest frozen interval | 21.2 s | 4.6 s |
| Hook | answer drawn at 6.6 s, prediction asked at 9.5 s | answer withheld; prediction chips plus a 5 s countdown |
| Resolution | 1280×720 | 1920×1080 |
| Audio | voice only | voice + bed + 8 effect types, ducked, limited, loudness-normalised |

Three caveats, stated so they are not lost:

1. The bed is currently the **synthesised placeholder** (`audio-mix.json` shows
   `source: "synth"`). Drop licence-audited tracks into `assets/audio/bgm/`, add
   manifest entries, and the pipeline selects them by mood and records the
   licence in the report.
2. Sync is now **phrase-accurate, not word-accurate**: the composer places motion
   on the measured phrase boundaries from the speech engine. Turning forced
   alignment on by default is still the next sync step (§3.4).
3. These metrics are a proxy for teaching quality, not a replacement for the
   educator review gate. They catch "the screen is frozen while the voice
   explains"; they cannot catch a misleading analogy.

---

## 8. Phase B — the transformation engine (2026-10-22)

The partition archetype is now rendered by a real transformation engine rather
than a templated reveal.

**`src/fair-partition.mjs`** builds one persistent bar object and performs the
repartition on it:

| Phase | What the viewer sees |
|---|---|
| build | the outline draws, the bar fills, then the shaded amount wipes in from the left |
| cut | a blade travels down each new boundary; the bar squashes, the shade glints, the cut settles — one tick sound per cut, emitted by the renderer and mixed into the audio |
| count parts | the denominator becomes the new count and every piece is counted in order |
| count shaded | the numerator becomes the count of shaded pieces, and each shaded piece is stamped with its number |
| invariant | the shaded right edge is marked and pulsed — the one thing that never moved |
| write | the scaling annotation appears beside numerator and denominator, then `1/2 = 2/4` is written |

Two properties make this trustworthy rather than decorative:

1. **The shaded amount cannot change.** It is a single rectangle that is only
   ever wiped or pulse-tinted during the cut — never resized or re-positioned.
   The invariant is structural, not an assertion in the narration. A test
   (`test/fair-partition.test.mjs`) fails if anyone animates its geometry.
2. **Geometry is derived.** Part positions, cut counts and shade length come from
   the validated fraction and its whole-number factor; the model cannot invent a
   cut in the wrong place.

Plus a motion layer that applies to every scene: a slow per-scene push, and a
breathing, floating guide whenever Pip is on screen.

### Measured animation weight

Frame-difference energy (`npm run metrics -- --video <mp4>`) on the same lesson:

| Cut | Frozen seconds | Visibly animated seconds | Mean motion |
|---|---:|---:|---:|
| v3 (Phase A−) | 70 / 175 (40 %) | 92 | 0.197 |
| v4 (Phase A) | 29 / 183 (16 %) | 136 | 0.382 |
| **v5 (Phase B)** | **0 / 183 (0 %)** | 96 (52 %) | 0.240 |

Reading these honestly:

- **No second of v5 is frozen.** The picture is always doing something, which is
  what stops an explainer feeling like a slide deck.
- v4 had *more* "strong" motion seconds because its output relied on large
  opacity fades; v5 replaces those with localised, physical transformation, so
  the pixel energy is lower while the animation is more meaningful. Frame
  difference measures how many pixels changed, not whether the change taught
  anything — it is a smoke alarm, not a taste metric.
- The next lever for weight is the Pip rig (authored character motion across
  every scene), not more camera drift.

---

## 9. Phase C — measured words and self-auditing renders (2026-10-24)

The loop this phase closed: research → select → generate → quality-check →
decide. Three branches were evaluated and two shipped.

### Branch 1 — local diffusion footage: decided no

Frame-level review of the isolated MiniMax H3 and LTX 2.5 test clips
(`outputs/local-model-tests/evaluation/`): H3 preserved the paper-strip
invariant (the strongest diffusion result so far) but carries freeze segments,
512×288 output and ~66 GPU-seconds per output second on this machine; LTX 2.5
was near-static and missed the repartition; Wan2.2 was already distorted.
Diffusion can illustrate but cannot demonstrate — the deterministic renderer
keeps sole responsibility for correctness-critical motion. Full decision note:
`outputs/local-model-tests/README.md`.

### Branch 2 — measured word timing: shipped

- `FAIR_ALIGNMENT_MODEL_DIR` is set in `.env`; the pinned local
  Qwen3-ForcedAligner (`qwen-aligner-8bit`, already installed) now runs on every
  real render. Each scene's words carry measured start/end seconds.
- The aligner can squeeze a fast function word to a zero-length span;
  `scripts/fair-align-speech.py` now repairs those by borrowing ≤30 ms from a
  roomy neighbour, keeping the strict validator (`fair-alignment.mjs`)
  unchanged. Discovered on the very first aligned render — the word "it" in the
  hook arrived as [3.18, 3.18].
- `fairCaptionChunks` accepts aligned word times: caption chunks now break on
  real word boundaries instead of character-proportional estimates. The v5→v6
  delta on the benchmark: caption start drift was already small (p50 0.06 s,
  max 0.55 s) because this voice is steady — but the timing is now *measured*,
  and narration.json carries word times for every future beat-cue consumer.
- The report is truthful about it: `timing.wordTimingSource`, the Captions
  check detail, and the sync warning all distinguish forced-aligned from
  estimated.

### Branch 3 — the QC loop audits itself: shipped

The pacing tool was reading "1 change per scene" on Phase-B output: the
scene-spanning ambient push merged every interval. `tools/fair-teaching-metrics.mjs`
now excludes always-on tweens (scene-root push, presenter breathing) from
content-change counting, excludes declared thinking-pause windows from
frozen-time budgets (thinking time is a feature, not a stall), and fixes a CLI
bug that dropped the first positional dir when `--video` was absent.

Honest numbers this produces on the benchmark (v5 = v6 timelines are identical):

| Gate | Value | Limit | Result |
|---|---|---:|---|
| Still-picture share | 11 % | ≤40 % | pass |
| Content changes / min | 23.3 | ≥8 | pass |
| One-shot scenes | 0 | 0 | pass |
| Longest frozen interval | 4.62 s | ≤6 s | pass |
| Frame-diff: frozen seconds | 1 % | ≤10 % | pass |
| Frame-diff: visibly animated | 50 % | ≥40 % | pass |

`fairRenderLesson` now embeds both audits in every `quality-report.json`
(`pacing` + `motion` blocks) and writes `contact-sheet.jpg` — sixteen tiles of
the whole lesson — into the project and manifest, so the educator scan happens
in one glance and every future render carries its own quality evidence.

### What the loop surfaced next

- Reveal choreography is phrase-accurate; the beat contract (§3.2) now has real
  word times to compile against — cue-word → aligned-time is unblocked.
- `guidance/presence`: the Pip rig remains the visible-quality lever; event-
  driven reactions at predict/reveal/repair are the next candidate change.
- The music bed is still the synthesised placeholder — the only remaining
  non-measured input in the pipeline.
