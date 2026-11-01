# Narration, Audio, Timing/Sync and Verification/QA — evidence report

**Scope.** Read-only analysis of `/Users/premkumarmamidi/Development/Ideas/video-studio` at commit state visible on disk (2026-10-26, working tree). Sources read in full: `src/voice.mjs`, `src/neural-voice.mjs`, `src/qwen-voice.mjs`, `src/cloud-speech.mjs`, `src/alignment.mjs`, `src/audio.mjs`, `src/open-render.mjs`, `src/wan.mjs`, `src/open-config.mjs`, `tools/teaching-metrics.mjs`, `tools/check-env.mjs`, `src/pipeline.mjs`, `src/composition.mjs`, `src/film.mjs`, `src/animation.mjs`, `src/plan.mjs` (relevant sections), `scripts/manim-scene.py`, tests, and the real job at `.fair-video/cfa9525f-17d6-418b-8762-7005b905ee36/`.

**Labels.** **[V]** = verified by reading code/running a read-only command. **[I]** = inference from code or evidence, not independently measured.
All line numbers refer to the files as they exist now.

---

## Top 10 gaps

1. **No speech-content verification on any local voice.** Script fidelity is only checked for the two cloud paths — OpenAI realtime (`src/cloud-speech.mjs:74`) and ElevenLabs character alignment (`src/neural-voice.mjs:109`). Piper, Kokoro and Qwen — including the voice actually used for the real render — have **no ASR and no listening gate**. Forced alignment proves word *order*, explicitly not pronunciation (`src/alignment.mjs:23`, `README.md:120-121`).
2. **A pure tone passes the audio gate.** "Non-silent audio" is `mean_volume > -60 dBFS` (`src/open-render.mjs:119`, `src/pipeline.mjs:132`). The renderer's own end-to-end test feeds a 440 Hz sine in place of narration and still asserts `report.passed === true` (`test/open-render.test.mjs:69`, `:80`). The gate cannot distinguish speech from a hum, a wrong take, or a mispronounced lesson.
3. **The pacing/motion audits are advisory, not gates — and absent from the Manim path.** `pacing`/`motion` only become *warnings* (`src/pipeline.mjs:160-161`); `report.passed` ignores them (`src/pipeline.mjs:166`). In the open-source renderer they are not computed at all (`src/open-render.mjs:116-123`), and `tools/teaching-metrics.mjs:51` hard-requires `storyboard.json`, which the Manim path never writes — so the audit command fails on the real project (see §4.3).
4. **The open-source renderer has no audio design.** `src/open-render.mjs` imports no audio module (imports at `:1-9`); there is no bed, no SFX, no ducking and no loudness normalisation. The real job rendered `audio: "voice"` (`smoke-report.json`) and its `project/audio/` contains only narration WAVs — no `bed.wav`, no `sfx.wav`. The `loudnorm=I=-16` target exists only in `src/audio.mjs:222` and is never used by this path.
5. **The music library is empty, so every "music" mix uses the synthetic placeholder.** `assets/audio/music-manifest.json` has `tracks: []` and `assets/audio/bgm/` is empty; `fairPrepareBed` therefore always takes the synth branch (`src/audio.mjs:204-206`). `README.md:158-160` and `docs/teaching-video-strategy.md:540` admit this.
6. **The "beat contract" exists for exactly one visual kind.** Only `base-ten` has spoken beats + cue words (`src/plan.mjs:25-46`, `:151-168`); the other 14 visual kinds have no cue schema (`src/plan.mjs:47-63`). Consequently Manim reveals are index-proportional for `steps`/`recap`/`equation` (`scripts/manim-scene.py:212-215`) and static at scene start for `comparison`/`number-line`/`place-value` (`scripts/manim-scene.py:216-217`). Real render: 9.3 words per visual change, a 12.07 s still hold in the question scene.
7. **Captions are chopped every 10 words, not at sentence boundaries.** `src/open-render.mjs:42-46`. In the real render 13 of 19 cue breaks land mid-sentence, two cues last under 1.2 s, and captions are rendered twice — burned into the picture (`scripts/manim-scene.py:180-195`) and embedded as a `mov_text` stream (`src/open-render.mjs:110`).
8. **The only real Manim render test is skipped by default.** `npm test` reports `skipped 1`; the skipped case is "real Manim renders all visuals … Set FAIR_MANIM_PYTHON to an installed Manim 0.22 interpreter" (`test/open-render.test.mjs:100-103`). `npm test` is `node --test test/*.test.mjs` with no `--env-file`, so `FAIR_MANIM_PYTHON` from `.env` is invisible to the suite that is supposed to cover the path used in production (`package.json` scripts).
9. **TTS pacing is ungoverned.** No per-scene duration cap; exceeding the target is a warning only (`src/open-render.mjs:127`, `src/pipeline.mjs:162`). The default provider Qwen3-TTS has **no rate parameter at all** (`src/qwen-voice.mjs:51`), Piper concatenates sentences with **zero inter-sentence silence** (`src/neural-voice.mjs:28-35`), and the measured lesson ranges 128–173 wpm scene-to-scene (§2.6).
10. **Loudness, sync and mix are asserted by construction, not measured.** `ffmpeg -t plan.durationSeconds` forces the duration the "Full timeline" check then compares against (`src/open-render.mjs:110`, `:120`); LUFS/true-peak are never measured anywhere (`grep loudnorm|ebur128|LUFS` → only `src/audio.mjs:222`); audio is encoded at 24 kHz mono in the open path (`src/open-render.mjs:110`, ffprobe confirmed) versus 48 kHz in the mix path (`src/audio.mjs:232`).

---

## 0. Evidence base

### 0.1 Commands run (read-only) and exact output

`npm test 2>&1 | tail -40`

```
ℹ tests 176
ℹ suites 0
ℹ pass 175
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 2099.17625
```

The skipped case (from the full log, line 89 of output):

```
﹣ real Manim renders all visuals and maximum base-ten grouping without executing generated code (42.5ms)
  # Set FAIR_MANIM_PYTHON to an installed Manim 0.22 interpreter for real renderer verification.
```

`node tools/teaching-metrics.mjs .fair-video/cfa9525f-.../project`

```
Error: ENOENT: no such file or directory, open '.../project/storyboard.json'
    at async teachingMetrics (file:///.../tools/teaching-metrics.mjs:51:33)
```

The requested command **fails** on the real project: the job was rendered by the open-source/Manim path, which writes `fair-render-plan.json` instead of `storyboard.json`.

`ffprobe -v error -show_streams -show_format .fair-video/cfa9525f-.../project/lesson.mp4` (trimmed)

```
index=0 codec_name=h264 codec_type=video width=1280 height=720 r_frame_rate=30/1 duration=75.333333 nb_frames=2260 bit_rate=54886
index=1 codec_name=aac  codec_type=audio sample_rate=24000 channels=1 duration=75.333333 bit_rate=93607
index=2 codec_name=mov_text codec_type=subtitle duration=74.687000 nb_frames=29 TAG:language=eng
duration=75.333333 size=1462364 bit_rate=155295
TAG:comment=Rendered with Manim Community v0.22.0
```

`node tools/teaching-metrics.mjs --video .../lesson.mp4`

```
2259 frames · 76s · mean motion 1.258 (p90 4.991, p99 8.68)
per second: frozen 14 (18%) · ambient 4 · visible 58 (76%) · strong 50
FAIL  never frozen: 18% of seconds have no visible change (max 10)
PASS  visibly animated: 76% of seconds (min 40)
```

### 0.2 Real job artefacts read

- `.fair-video/cfa9525f-.../project/quality-report.json` — `passed: true`, `status: generated-draft`, `educatorApproved: false`, `durationSeconds: 75.333`, `targetSeconds: 60`, 7 scenes, 6 checks all passed, 8 warnings, `timing.wordSources: ["forced-alignment"]`, aligner `mlx-community/Qwen3-ForcedAligner-0.6B-8bit`.
- `.fair-video/cfa9525f-.../smoke-report.json` — 230.8 s elapsed, brief `{text:"Teach place value.", generationVersion:"open-source", footage:"none", provider:"local", voiceProvider:"piper", targetSeconds:60, avatar:"none", intro:"none", audio:"voice", model:"qwen3:30b"}`; `smoke-report-attempt-1.json` is byte-identical to the final report.
- `project/narration.json` — 7 tracks, `timingSource: phrase-measured`, `wordTimingSource: forced-alignment`, per-scene `words[]` with `startSeconds`/`endSeconds`.
- `project/lesson.json`, `project/captions.vtt` (20 cues), `project/fair-render-plan.json`, `project/prompts.json`, `project/manifest.json`.
- `render.log` — Manim 0.22.0, ffmpeg 9.0.2, volumedetect `mean_volume: -18.0 dB`, `max_volume: -1.3 dB`.
- `review.json` — `{"decision":"needs-changes","note":"Automated E2E check — review flow verified; still needs a real educator pass.","reviewer":"e2e"}`.

There is no `.fair-video` job produced by the HyperFrames path anywhere in the tree (only the two smoke copies of the same Manim job), so **all real-render evidence in this report is for the open-source/Manim path**.

---

## 1. Narration pipeline

### 1.1 Engines and selection — [V]

| Provider | Config (file:line) | Model / voice | Rate control | Word timing source | Tier label |
|---|---|---|---|---|---|
| `qwentts` (default) | `src/voice.mjs:28-30` | Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit, voice `teacher`, profile `content/voices/teacher.json` | **none** (`src/qwen-voice.mjs:42,51`); temperature 0.7, reseeded per phrase | estimated words; phrase-measured | neural |
| `piper` | `src/voice.mjs:31-35` | `en_IN-spicor`, `navgurukul-ai-labs/...` | `lengthScale` 1.08 (0.5–2) | estimated words; phrase-measured | neural |
| `kokoro` | `src/voice.mjs:23-27` | Kokoro-82M-v1.0, `bf_emma` | `speed` 0.95 (0.5–1.5) | estimated words; phrase-measured | neural |
| `say` | `src/voice.mjs:36` | macOS system voice | `rate` 145 wpm | estimated | system |
| `openai` | `src/voice.mjs:21-22` | `gpt-realtime-2.1-mini`, marin/cedar/coral | only prose: "about 145 words per minute" | estimated | premium |
| `elevenlabs` | `src/voice.mjs:20` | `eleven_multilingual_v2`, voice ID | none in request body (`src/neural-voice.mjs:126`) | provider character alignment | premium |

Selection order: `brief.voiceProvider` → OpenAI mode → `FAIR_TTS_PROVIDER` → `qwentts` (`src/voice.mjs:17`). Paid providers must be chosen explicitly (`src/voice.mjs:19`); the open-source renderer refuses anything except qwentts/piper/kokoro (`src/open-render.mjs:55`); `plan.mjs` defaults open-source briefs to `qwentts` (`src/plan.mjs:83`) but the real job overrode it to `piper`.

### 1.2 How the script becomes audio — [V]

- **One TTS call per scene.** `for (const [index, scene] of lesson.scenes.entries())` (`src/voice.mjs:75`), reading `scene.narration` (schema: 10–1500 chars, `src/plan.mjs:15`).
- **Scenes are sub-split into phrases** only for the local sentence-based engines: `fairSpeechPhrases` splits on `(?<=[.!?;:])\s+` and at 350 chars (`src/neural-voice.mjs:44-54`). Each phrase is synthesised separately so phrase boundaries are *measured* (`src/neural-voice.mjs:63-98`, `src/qwen-voice.mjs:49-64`).
- **Piper joins phrases with no inserted silence** (`src/neural-voice.mjs:28-35`) — sentences run together at the concatenation point (the real render used Piper). Kokoro inserts 0.2 s (0.28 s after `!`/`?`) (`src/neural-voice.mjs:90-92`); Qwen inserts 0.22 s (`src/qwen-voice.mjs:60-61`).
- **Whole-scene single-shot** for `say`, `openai`, `elevenlabs` (`src/voice.mjs:88-99`) — no per-phrase timing at all.
- **Normalisation:** every scene is re-encoded to 24 kHz mono 16-bit PCM WAV (`src/voice.mjs:115`).
- **Caching:** per-scene `audio/<id>.wav.json` keyed by `fairHash({revision:3, text, voice})` + file sha (`src/voice.mjs:78-84,122-124`), so a re-render reuses audio and only re-aligns (`src/voice.mjs:126-129`).

### 1.3 Speaking rate and pauses — [V]

- **Rate:** only Piper (`lengthScale`) and Kokoro (`speed`) expose a numeric control; `say` uses 145 wpm; OpenAI gets a natural-language instruction; Qwen and ElevenLabs have no rate control. There is no per-scene rate adjustment and no shared "target wpm" constant.
- **Within-sentence pauses:** not controllable. Punctuation is passed to the engine; only Kokoro/Qwen insert a fixed inter-sentence gap.
- **Between-scene pauses:** `pauseSeconds` (0–15, `src/plan.mjs:96`) appended after the measured speech (`src/composition.mjs:261`, `src/open-render.mjs:21`). Questions require ≥3 s (`src/plan.mjs:278`) and quality mode ≥5 s (`src/plan.mjs:346`).
- **Duplicate pause instruction:** question narration is often written to *say* the pause ("Take five seconds to think.", `project/lesson.json` question) **and** `pauseSeconds: 5` is added. The child therefore waits ~5 s after being told to take five seconds.

### 1.4 Is voice quality validated? — [V] No automated validation

What exists:

| Check | Where | What it proves |
|---|---|---|
| WAV well-formed, mono 16-bit, non-silent (RMS > 0.0001) | `src/voice.mjs:46-65` | Not silence; not that words are correct |
| Alignment timestamps ≤ audio length + 0.1 s | `src/voice.mjs:121` | The aligner's own output is self-consistent |
| Aligned word sequence equals script (tokenised) | `src/alignment.mjs:10-21` | Word order only; an aligner forced onto a script will still align a mispronounced word |
| Transcript equality | `src/cloud-speech.mjs:74` (OpenAI) | Script fidelity for that provider only |
| Character-alignment equality | `src/neural-voice.mjs:109` (ElevenLabs) | Script fidelity for that provider only |
| `quality-report.voice` tier string | `src/voice.mjs:123` | A label, not a measurement |

What does **not** exist: ASR verification wired into the pipeline, MOS/pronunciation scoring, a recorded listening verdict. The only ASR in the repo is a one-off pilot script `scripts/decimal-transcribe.py` (mlx-whisper base.en) invoked from `scripts/decimal-pilot.mjs:198`, which itself records `humanListeningReview: false` and "Needs human review: independent ASR ambiguously rendered hundredths". `README.md:154-155` states the designed voice needs a listening check per batch; `review.json` for the real job is an e2e metadata write with `needs-changes`. **No gate reads either fact.**

### 1.5 What breaks when TTS is slow or uneven — [V]/[I]

- **Slow:** scene duration simply grows (`duration = nar + pause + 0.7`, `src/composition.mjs:261`; `ceil((nar+pause+.7)*30)/30`, `src/open-render.mjs:21`). No cap, no re-plan, no re-synthesis. Only a post-hoc warning when total > 1.15 × target (`src/open-render.mjs:127`, `src/pipeline.mjs:162`). The real lesson is 75.3 s against a 60 s target (+25.6%).
- **Per-scene timeouts:** Piper/Kokoro 300 s (`src/neural-voice.mjs:38,96`), Qwen 600 s (`src/qwen-voice.mjs:65`), cloud 120 s (`src/cloud-speech.mjs:48`, `src/neural-voice.mjs:127`). A timeout aborts the whole render; there is no retry or fallback voice.
- **Uneven:** because durations follow the audio, uneven speech becomes uneven *scenes* — measured 128–173 wpm across one 7-scene lesson (§2.6). Nothing flags it.
- **Mismatch:** if aligned words extend beyond the produced audio by >0.1 s the render throws (`src/voice.mjs:121`) — an uneven take fails rather than degrades.
- **Silent/empty take:** caught only by RMS (`src/voice.mjs:65`); a truncated take that still aligns will pass.
- **Cache traps:** changing only the voice *instructions* changes the fingerprint (config is hashed whole, `src/voice.mjs:78`), but changing the aligner model does not invalidate narration, only alignment (`src/alignment.mjs:29-30`) — correct behaviour, worth noting.

---

## 2. Timing and sync contract

### 2.1 Narration duration → scene duration — [V]

| Path | Formula | Lead/tail | file:line |
|---|---|---|---|
| HyperFrames/classic | `duration = max(4, track.duration + pauseSeconds + 0.7)`; `speechStart = at + 0.35` | 0.35 s lead, 0.7 s tail (min 4 s scene) | `src/composition.mjs:260-261` |
| HyperFrames/film | identical | same | `src/film.mjs:44` |
| Open-source/Manim | `duration = ceil((track.duration + pauseSeconds + 0.7) * 30) / 30` (frame-quantised up) | 0.35 s lead, 0.35–0.7 s tail | `src/open-render.mjs:21` |

The 0.35 s lead is applied consistently in the open path: visual cues `+0.35` (`src/open-render.mjs:27`), caption start `+0.35` (`:44`), audio `adelay=(start+0.35)` (`:105`), Manim question hold `start+0.35+narration` (`scripts/manim-scene.py:206`). HyperFrames uses the same 0.35 via `speechStart` for audio clips, captions and cue math (`src/composition.mjs:260,269-270,291`).

Real plan (`fair-render-plan.json`): starts 0, 10.567, 21.867, 35.6, 47.067, 59.133, 66.633; total 75.333. Speech 65.329 s (86.7 % of runtime); non-speech time 10.004 s = 5.0 s declared thinking pause + ~5.0 s of 0.7 s scene tails (plus frame rounding). Each scene also begins its narration 0.35 s after its visual appears.

### 2.2 Word timings — [V]

- **Forced alignment** is the only word-accurate source: `fairAlignSpeech` runs `scripts/align-speech.py` against `FAIR_ALIGNMENT_MODEL_DIR` (Qwen3-ForcedAligner-0.6B-8bit in the real job), caches by `{audio sha256, text, modelDir, config hash, weights size/mtime}` and validates every word (`src/alignment.mjs:24-43`). Called per scene inside narration when the env var is set (`src/voice.mjs:126-129`).
- **Fallback without the env var:** `fairEstimatedWords` distributes each phrase's duration across its words weighted by character count (`src/neural-voice.mjs:55-61`), labelled `wordTimingSource: 'estimated'` (`src/voice.mjs:119`). This ignores intra-phrase pauses (the real question track has a 0.48 s gap "fifty-two,→what" that estimation would smear).
- **ElevenLabs** returns provider character alignment, converted to words with a script-equality check (`src/neural-voice.mjs:101-141`).
- **OpenAI/`say`** have no word timing; captions and cues fall back to estimation.

### 2.3 Are visual reveals anchored to words? — [V] Only for base-ten

| Visual kind | Anchor | file:line |
|---|---|---|
| `base-ten` (all modes) | **word-locked**: cue `wordIndex` → aligned word start | `src/plan.mjs:151-168`, `src/animation.mjs:6-16`, `src/open-render.mjs:25-28`, `scripts/manim-scene.py:98-137` |
| `steps`, `recap`, `equation` (Manim) | index-proportional: `start + .35 + index/len * narrationSeconds` | `scripts/manim-scene.py:212-215` |
| `comparison`, `number-line`, `place-value` (Manim) | **scene start**, then nothing | `scripts/manim-scene.py:216-217` |
| `steps`/`recap` (HyperFrames) | phrase-snapped if within 0.4–0.45 s, else proportional | `src/composition.mjs:218-227`, `:316-320` |
| generic `.reveal` elements | uniform stagger from `scene.start+0.25` | `src/composition.mjs:321-323` |
| interaction chips | proportional to speech duration (hook: 0.68 fixed) | `src/composition.mjs:368-377` |
| fraction partition / equivalence / comparison | fractions of speech duration via `phraseAt` (0.2…0.9) with phrase snapping | `src/composition.mjs:308-313`, `:334-367` |
| presenter mouth | audio energy envelope, explicitly not phoneme lip-sync | `src/voice.mjs:44-67`, `src/composition.mjs:386-389` |

The real render therefore has **three word-locked events per base-ten scene** and nothing between them — 18 changes total for 167 words.

### 2.4 What "the beat contract gap" means in code — [V]

The README says "visual reveals are still phrase-accurate until the beat contract lands" (`README.md:164-166`). The design is specified in `docs/teaching-video-strategy.md:150-190`: a scene is 2–6 beats, each `{say, change, preserves}`, `say` must occur exactly once, cues carry a word index, ≥1 change per 12 words, ≤35 words/beat.

What actually exists:

- A generalised *validator* in spirit but a **single-kind implementation**: `baseTenCueWordOffsets` requires exactly 3 cues in order `show-objects → transform → show-notation` and each cue phrase to occur exactly once (`src/plan.mjs:151-168`), used at validation time (`src/plan.mjs:315`).
- A compiler that turns 3 model-written `spokenBeats` into narration + cues, choosing the longest distinct prefix as the cue phrase (`src/plan.mjs:25-46`).
- **Only the `base-ten` visual schema has a cue field** (`src/plan.mjs:54`); the other 14 kinds (`place-value`, `equation`, `comparison`, `number-line`, `steps`, `recap`, `fraction-bars`, `bar-model`, `area-grid`, `angle`, `coordinate-grid`, `chart`, `average-share`, `clock`) have none (`src/plan.mjs:47-63`).
- The strategy doc's own status note says the contract "now has real word times to compile against" but it is still §3.2 work (`docs/teaching-video-strategy.md:536-538`).

So the gap is: **word-level timing exists and is good; the schema to attach more than three teaching changes to it exists for one template only.** Everything else is phrase-proportional (`src/composition.mjs:308-313`) or a fixed fraction of the speech duration (`:329-355`).

### 2.5 Where drift can creep in — [V]/[I]

1. **Estimated word times** (no `FAIR_ALIGNMENT_MODEL_DIR`, or OpenAI/`say`): uniform character-weight distribution ignores pauses and emphasis; any cue using them is systematically early through clause boundaries (`src/neural-voice.mjs:55-61`). Real job has the aligner, so this is latent, not active.
2. **Positional, not id-based, join between tracks and scenes.** `tracks.map((track, index) => ... plan.scenes[index].startSeconds ...)` (`src/open-render.mjs:105`) and `plan.scenes[index]` in the same expression. Tracks are pushed in scene order (`src/voice.mjs:75,130`), so this is correct today; any filtering, retry or reordering silently desyncs audio by whole scenes. [I]
3. **`fair_wait_until` silently skips a late cue.** `if (remaining > 1/60) wait` (`scripts/manim-scene.py:87-90`). If an animation overruns its cue window, the next reveal lands immediately *after* the spoken word rather than resyncing. The transform run-time is bounded by the gap (`:107`), which mitigates but does not eliminate it.
4. **0.35 s constant is assumed, never measured.** It is applied identically to picture, captions and audio in the open path, so a systematic A/V offset is at least consistent; a caption/audio offset error would need two places to diverge.
5. **AAC encoder priming** adds ~1024 samples (≈21 ms at 24 kHz) of codec delay with no compensation in either mux path (`src/open-render.mjs:110`, `src/audio.mjs:229-233`). [I] — small but real, and unmeasured.
6. **Frame quantisation** rounds every scene *up* to 1/30 s (`src/open-render.mjs:21`), so the audio always starts at or after the visual boundary; tails absorb it, but the drift is not asserted anywhere.
7. **Overlapping scene audio is not prevented.** Audio is `adelay`-ed but never trimmed to the scene slot; `amix normalize=0` (`src/open-render.mjs:106`). With `duration = nar + 0.7` it cannot overlap today; if `pauseSeconds` were negative (schema forbids) or the track changed after planning, two scenes could talk over each other.
8. **Caption gaps at scene boundaries:** because captions start at the first word and end at the last word, the real file has 1.14–1.43 s blank between scenes and 6.29 s blank across the question pause (§2.6). Nothing checks caption coverage.
9. **SFX are fraction-of-speech, not word-locked** (`src/audio.mjs:115-118`) — see §3.3.

### 2.6 Measured pacing of the real lesson — [V]

From `narration.json` + `lesson.json` + `fair-render-plan.json`:

| Scene | Narration s | Words | wpm | pause | Cue times (scene-local) |
|---|---|---|---|---|---|
| hook | 9.857 | 27 | 164 | 0 | 0.94, 4.15, 7.42 |
| concept | 10.588 | 28 | 159 | 0 | 1.02, 4.99, 7.77 |
| example | 13.015 | 32 | 148 | 0 | 0.94, 4.70, 10.59 |
| misconception | 10.739 | 31 | 173 | 0 | 0.99, 4.72, 8.97 |
| question | 6.339 | 17 | 161 | 5 | — (text only) |
| answer | 6.792 | 15 | 133 | 0 | 0.94, 3.09, 5.54 |
| recap | 7.999 | 17 | 128 | 0 | 0.86, 4.07, 6.08 |

Totals: 167 words, 65.329 s speech, 153.4 wpm while speaking, 133 wpm over the 75.333 s video. Longest intra-scene word gap 0.71 s; inter-sentence gaps 0.48–0.71 s (Piper inserts no silence, yet measured gaps of ~0.5 s exist — the engine's own punctuation pauses) [V].

Derived proxy pacing gates (the tool cannot read a Manim plan, so these are computed from `fair-render-plan.json`): **18 content changes**, 14.3 changes/min, **9.3 words/change**, per-scene static tails 1.96–3.53 s except the question (**12.07 s**, 100 %), total static tail 28.97 s = **38.4 %** (gate max 40 → passes by 1.6 points), **one-shot scenes: [question]** (gate max 0 → fail), **longest frozen interval 12.07 s** (gate max 6 → fail).

---

## 3. Audio design

### 3.1 Music bed — [V]

- **Manifest-driven, never downloaded:** `assets/audio/music-manifest.json`; selection is first track whose mood matches, else `focus`, else first (`src/audio.mjs:179-187`).
- **Manifest is empty** (`tracks: []`, `assets/audio/bgm/` empty) → the synth placeholder is always used (`src/audio.mjs:204-206`): a 4-chord pad progression (two bars per chord), one soft 55 Hz pulse per beat, sparkle on the first 2 % of each beat, peak-normalised to 0.55 (`src/audio.mjs:145-177`).
- **Licensed path** loops and trims with fades (`-stream_loop -1`, `atrim`, `afade in/out`) (`src/audio.mjs:199-202`).
- **Mood is hard-coded `'focus'`** by the pipeline regardless of lesson beat (`src/pipeline.mjs:103`).

### 3.2 Ducking / mix graph — [V]

Single ffmpeg graph (`src/audio.mjs:212-224`):

```
[0:a] aformat fltp/stereo, volume=1                        → voice
[1:a] aformat fltp/mono, atrim, volume=0.26*if(between(...pauses),0.45,1) → bed
[bed][voice] sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400
[2:a] volume=0.85                                          → sfx
[voice][bedduck][sfx] amix=3:duration=first:normalize=0, alimiter=0.95, loudnorm=I=-16:TP=-1.5:LRA=11
```

Constants: `FAIR_BED_GAIN 0.26` (−11.7 dB), `FAIR_PAUSE_BED_GAIN 0.45`, `FAIR_SFX_GAIN 0.85`, `FAIR_DEFAULT_BPM 88` (`src/audio.mjs:19-25`).

- **Pause automation mismatch:** the storyboard's pause windows come from `['question','hook']` (`src/composition.mjs:293`), but the returned `audioCues.pauses` used for ducking are question-only (`src/composition.mjs:426`). A hook with `pauseSeconds > 0` gets a visual countdown but no bed thinning.
- **Single-pass `loudnorm`** is approximate; no second pass, no measurement afterwards (see §4).
- **The mix re-encodes audio to 48 kHz AAC 192k and stream-copies video** (`src/audio.mjs:229-233`) — good practice.

### 3.3 SFX scheduling — [V]

- Eight deterministic recipes (tick/click/pop/chime/success/whoosh/pen/hmm), seeded noise, no licence (`src/audio.mjs:57-89`).
- Placement (`src/audio.mjs:105-124`): whoosh at every cut >0.05 s (snapped to 1/2 beat within 0.12 s); question → tick at pause open + chime at pause close; answer → chime at 55 % of speech; misconception → hmm at 50 %; recap → success at 50 %; example → pen at 20 %.
- Cue-driven extras from the partition animator are merged and sorted (`src/audio.mjs:120-123`, `src/composition.mjs:424`).
- **Quality risks:** the answer chime at 55 % of speech lands mid-word whenever speech is continuous; the recap "success" at 50 % fires while the teacher is still explaining; pause-close chime (0.9 s decay) overlaps the next scene's first word because the next scene starts 0.35 s later (`src/audio.mjs:113` + `src/composition.mjs:260`) [I]. None of this is verified.
- **Not used at all on the Manim path** (`src/open-render.mjs` imports no audio module).

### 3.4 Loudness — [V]

- Target `I=-16 LUFS, TP=-1.5 dB, LRA=11` exists only inside the music mix (`src/audio.mjs:222`).
- The only measurement anywhere is `volumedetect` mean/max (e.g. `src/pipeline.mjs:114`, `src/open-render.mjs:113`, `src/proof-quality.mjs:36-37`). No `ebur128`, no `loudnorm print_format=json`, no true-peak check (`grep loudnorm|ebur128|LUFS` → one hit).
- Real render: mean **−18.0 dBFS**, max **−1.3 dBFS**, 24 kHz mono AAC 93 kb/s (`render.log`, ffprobe). Mean dBFS is not LUFS, but this is roughly 2 dB below the graph's −16 LUFS target and below usual dialogue level; nothing checks it against either. [I]
- **Per-scene level is never normalised** (`amix normalize=0`, `src/open-render.mjs:106`); a quiet take stays quiet.

### 3.5 What the real render actually contains — [V]

`audio: "voice"` in the brief (`smoke-report.json`), `src/open-render.mjs` imports no `audio.mjs`, and `project/audio/` has 42 files, all narration sources/WAVs/alignment caches — **no bed, no SFX, no mix**. The delivered lesson is voice-only, at 24 kHz, mean −18 dBFS.

---

## 4. Verification gates

### 4.1 HyperFrames path (`src/pipeline.mjs`)

| Gate | file:line | Can prove | Cannot prove |
|---|---|---|---|
| Renderer `check` (layout/playback) | `:80-86` | Composition loads, elements fit, no runtime errors; `browserSkipped` is treated as failure (`:82`) | Teaching quality, sync, audio, pacing |
| `render --strict` | `:89` | Renderer did not emit warnings it treats as fatal | Anything about content |
| Video stream present | `:130` | An MP4 has a video stream | Resolution/fps (not checked here) |
| Narration track present | `:131` | An audio stream exists | Speech, loudness, language |
| Non-silent audio | `:132` | Mean level > −60 dBFS | Speech vs tone vs wrong take |
| Full timeline | `:133` | Final duration within 1 s of the computed composition duration | That the composition duration is right; ffmpeg `-t` makes it near-tautological in the open path |
| Captions | `:134-137` | `composition.captions.length > 0` and the file starts with `WEBVTT` | Cue monotonicity, text/audio agreement, readability |
| Music and sound design | `:138` | **Nothing** — hard-coded `passed: true` whenever music mode is on | Whether the bed is licensed, audible, or ducked |
| Quality-mode checks (7) | `:140-152` | Beat presence (`:148`), ≥2 questions (`:149`), pause ≥5 s (`:150`), and four treatment flags read from `composition.qualityProof` (`:144-147`) | Three of the four flags are computed from the same plan they validate (`src/quality-storyboard.mjs:20-34`, `:36-54`) — self-referential |
| Pacing gates | `:127`, `:160` | Recorded in the report | **Do not fail the render** — warning only |
| Motion gates | `:128`, `:161` | Recorded in the report | **Do not fail the render** — warning only |
| Contact sheet | `:121-123` | 16 tiles exist | No automated visual check of their content |
| Educator approval | `:166`, `src/open-render.mjs:124` | Nothing — always `false`; review is metadata (`src/jobs.mjs:66-75`) | That anyone watched it |

### 4.2 Open-source/Manim path (`src/open-render.mjs`)

| Gate | file:line | Can prove | Cannot prove |
|---|---|---|---|
| Manim import + ffmpeg version | `:63-65` | Toolchain exists | — |
| Reviewed lesson | `:52` | `lesson.quality.reviewed === true` (an LLM critique flag) | Educator review |
| Local provider only | `:55` | Voice is qwentts/piper/kokoro | Voice quality |
| Video stream | `:117` | Stream exists | — |
| Narration track | `:118` | Stream exists | — |
| Non-silent audio | `:119` | Mean > −60 dBFS | Speech |
| Full timeline | `:120` | `|measured − plan| < 0.2 s`, where ffmpeg forced `-t plan.duration` (`:110`) | Scene-level sync; content |
| Captions | `:121` | `captions.length > 0` and a subtitle stream exists | That captions match speech or are legible (double-rendered, §4.4) |
| Word alignment | `:122` | Every track reports `wordTimingSource === 'forced-alignment'` | Pronunciation; and **the check disappears entirely if `FAIR_ALIGNMENT_MODEL_DIR` is unset** (vacuous by omission) |
| Coverage | `:126` | A scene is *tagged* with the objective and its beat is concept/example/misconception | That the objective was taught |

Not present on this path: pacing gates, motion gates, contact sheet, renderer layout check, music/SFX verification, loudness target.

### 4.3 What `quality-report.json` for the real render contains — [V]

6 checks, all `passed: true`; no `pacing`, no `motion`, no `audio` object; `timing.wordSources: ["forced-alignment"]`; `educatorApproved: false`. `tools/teaching-metrics.mjs` cannot audit it (`storyboard.json` missing). The report is therefore **silent about the two things that most affect perceived quality: how much the picture moves, and what the audio actually is.**

### 4.4 Checks that pass vacuously or are self-referential — [V]

1. **Music/sound design** — unconditional `passed: true` (`src/pipeline.mjs:138`).
2. **Quality-mode proof flags** — `semanticTargets`, `progressiveReveal`, `protectedResponses` are derived from the same scene plan they validate, then read back as "checks" (`src/quality-storyboard.mjs:36-54` → `src/pipeline.mjs:144-147`).
3. **Coverage** — computed from objective IDs on scenes (`src/open-render.mjs:126`, `src/pipeline.mjs:163-165`); it is a tag census, not evidence of teaching.
4. **Full timeline** — output is cut to exactly `plan.durationSeconds` with `-t` (`src/open-render.mjs:110`), so the check mostly verifies ffmpeg obeyed.
5. **Word alignment** — omitted when the aligner is not configured; passes on the aligner's own output otherwise.
6. **Non-silent audio** — −60 dBFS threshold; the suite itself passes a sine wave through this gate (`test/open-render.test.mjs:69`, `:80`).
7. **Captions** — presence only; the real file has 13/19 mid-sentence breaks and 2 sub-1.2 s cues, undetected.
8. **Pacing/motion** — recorded but never fatal (`src/pipeline.mjs:160-161`); the real 18 % frozen render still reports `passed: true`.
9. **Educator approval** — hard-coded false, and the review record does not gate distribution (`src/jobs.mjs:66-75`).

### 4.5 Real-render quality numbers — [V]

| Metric | Value | Gate | Verdict |
|---|---|---|---|
| Motion: frozen seconds | 14 / 76 = **18 %** | ≤10 % | **FAIL** (not fatal) |
| Motion: visible seconds | 58 / 76 = **76 %** | ≥40 % | PASS |
| Motion: still frames | 65.7 % of 2259 frames | — | reported only |
| Motion: mean / p90 / p99 | 1.258 / 4.991 / 8.68 | — | — |
| Frozen seconds located | 17, 19, 20 (concept), 48, 49, 51, 52 (question card), 56, 57, 58 (thinking pause), 62, 65 (answer), 68, 69 (recap) | — | 3 s of the 14 are the *declared* pause; the rest are inter-cue dead air and scene tails |
| Content changes | 18 (3 per non-question scene) | ≥8/min | 14.3/min PASS |
| Words per change | 9.3 | — | — |
| One-shot scenes | 1 (`question`) | 0 | **FAIL** |
| Longest still interval | 12.07 s | ≤6 s | **FAIL** |
| Static tail | 28.97 s = 38.4 % | ≤40 % | PASS (margin 1.6 pts) |
| Duration vs target | 75.33 s vs 60 s | ±15 % warning | WARN (+25.6 %) |
| Audio mean / max | −18.0 / −1.3 dBFS | > −60 only | PASS trivially |
| Video / audio format | 1280×720 30 fps 54.9 kb/s H.264, 24 kHz mono AAC 93 kb/s | none | — |

Note on the frozen number: the motion audit has no notion of declared pauses, unlike the DOM pacing audit which subtracts them (`tools/teaching-metrics.mjs:79-95` vs `:139-177`). Excluding the 5 s question pause, the honest frozen share is ~14.5 % — still over the 10 % threshold.

### 4.6 Visual spot-check — [V]

Frames extracted at 15 s, 50 s, 62 s, 70 s (`.fair-video/analysis/frame-*.jpg`):

- 720p, flat cream background, serif Pango text; no branding, progress, or chapter cue beyond the scene title.
- Large unused vertical space (~60 % of frame) in every base-ten scene; 37 ones drawn as tiny 7 px squares (`scripts/manim-scene.py:18,35-47`).
- The question scene is a wall of text that repeats the burned-in caption verbatim ("In the number fifty-two, what is the value of the tens digit? Take five seconds to think.") — the same sentence appears twice on screen at once.
- Caption band is visible on every frame, duplicating the embedded `mov_text` track.
- Content is numerically correct where checked (answer scene shows 5 tens + 2 ones for 52; recap shows 3 tens + 7 ones for 37).

---

## 5. Open-source (Manim) vs HyperFrames path

| Dimension | HyperFrames (`src/composition.mjs`, `src/film.mjs`) | Open-source (`src/open-render.mjs`, `scripts/manim-scene.py`) |
|---|---|---|
| Canvas | 1920×1080 (`src/composition.mjs:164-167`) | 1280×720 (`src/open-render.mjs:33`) |
| Timing source | same measured narration; 0.35 lead, 0.7 tail (`src/composition.mjs:260-261`) | same measured narration; frame-quantised (`src/open-render.mjs:21`) |
| Word-locked reveals | base-ten + phrase-snapped lists + fraction/partition choreography (classic: `src/composition.mjs:306-367`; film: `src/animation.mjs:6-16`) | base-ten only (`scripts/manim-scene.py:92-138`); everything else proportional or static (`:212-217`) |
| Presenter / character | Pip sprite rig with 8 poses, audio-energy lip motion, breathing (`src/film.mjs:60-78`, `src/composition.mjs:386-395`) | none |
| Music bed + SFX + ducking | yes (`src/pipeline.mjs:94-107`) | **no** |
| Loudness target | only when music mode (`src/audio.mjs:222`) | **no** |
| Pacing + motion audits | embedded in `quality-report.json` (`src/pipeline.mjs:127-128`) | **no** |
| Contact sheet | yes (`src/pipeline.mjs:121-123`) | no |
| Layout/playback check | `hyperframes check` (`src/pipeline.mjs:80-86`) | none; only Manim's frame-bounds assertion (`scripts/manim-scene.py:80-85`) |
| Captions | DOM overlay + VTT (`src/film.mjs:94-96`) | burned-in **and** `mov_text` + VTT (double) |
| Maths correctness | templates are parameterised but geometry/animation is procedural HTML | structured Manim objects driven by a validated JSON plan; no model code (`scripts/manim-scene.py:1-4`) |
| Determinism | GSAP timeline, deterministic given the plan | Cairo render, deterministic given the plan |
| Failure modes | renderer/browser issues, heavier | Manim/Python environment, 720p ceiling, plain visuals |
| Verdict | richer presentation, deeper QA surface, but several gates are advisory or self-referential | more honest timeline, better maths structure, **thinner QA and no audio design** |

**Production-worthy today?** Neither, by the project's own standard. The Manim path is the more *trustworthy* renderer (validated JSON, strict per-scene duration, real forced alignment) but its QA cannot see motion, loudness, music or captions-as-displayed, and its output looks like a slide deck. The HyperFrames path is the more *presentable* renderer but its extra checks are partly decorative. A production pipeline needs the Manim timing discipline **plus** the HyperFrames audio/presentation layer **plus** the missing speech and loudness gates.

---

## 6. Concrete extension points (low blast radius)

| # | Change | Where | Blast radius | Effect |
|---|---|---|---|---|
| 1 | **ASR verification hook per scene** — optional `FAIR_ASR_CHECK=1`, run the existing `scripts/decimal-transcribe.py` logic per track, compare normalised transcript to script with a token error budget, write `asr.json` and add a check | new `src/asr-check.mjs`, called after `src/voice.mjs:126-129`; reuse `fairSpeechText` (`src/cloud-speech.mjs:12-20`) | new module + one optional call; no change to existing paths when disabled | Turns "alignment ≠ pronunciation" into a measured signal; catches dropped/mangled words on Piper/Qwen |
| 2 | **Real loudness measurement and a gate** — `ffmpeg -af ebur128` (or `loudnorm=print_format=json`) and assert `I ∈ [−17,−15]`, `TP ≤ −1.0` | `src/open-render.mjs:113-120`, `src/pipeline.mjs:114-139` | 1 helper + 1 check row per path | Makes the −18 dBFS render fail or trigger normalisation; replaces mean-dB proxy |
| 3 | **Per-scene gain normalisation** before assembly — `loudnorm`/`dynaudnorm` on each `audio/<id>.wav` at the existing transcode step | `src/voice.mjs:115` (one ffmpeg arg list) | one line; all providers benefit | Removes scene-to-scene level jumps (real lesson spans 128–173 wpm and unmeasured level variation) |
| 4 | **Motion + pacing gates for the Manim path** — call `motionMetrics(output)` and derive changes from `plan.scenes[].cues`; write `pacing`/`motion` into the report; make the two thresholds fatal (or a `strict` flag) | `src/open-render.mjs:116-123`, reusing `tools/teaching-metrics.mjs:139-196` | additive; report schema gains two keys | The 18 % frozen render would fail instead of shipping |
| 5 | **Make the motion audit pause-aware** — pass declared pause windows into `motionMetrics` and exclude those seconds from `frozenPercent` (mirroring `:79-95`) | `tools/teaching-metrics.mjs:139-177` | one function signature + callers (`src/pipeline.mjs:128`) | Removes the false positive that pushes thinking pauses into the frozen metric |
| 6 | **Sentence-aware captions** — chunk on `[.!?]` and a max character budget instead of every 10 words, with a minimum 1.2 s cue and merge of short tails | `src/open-render.mjs:42-46` (and `:36-49` generally) | one function | Fixes 13/19 mid-sentence breaks and the 0.48 s cue |
| 7 | **Stop double-rendering captions** — either drop the burned-in layer or skip the `mov_text` map | `scripts/manim-scene.py:180-195` **or** `src/open-render.mjs:109-110` | one side only | Removes duplicated text on screen |
| 8 | **Generalise the beat contract past base-ten** — add a `cues`/`spokenBeats` field to `steps`, `recap`, `comparison`, `number-line`, `place-value`; reuse `baseTenCueWordOffsets` logic as a kind-agnostic `cueWordOffsets` | `src/plan.mjs:47-63`, `:151-168`; consume in `scripts/manim-scene.py:212-217` and `src/open-render.mjs:24-28` | medium: schema + 2 consumers, but opt-in per kind | Converts "index-proportional" reveals into word-locked ones for the most common non-base-ten scenes |
| 9 | **Word-lock the SFX** — place answer/recap/misconception cues on the aligned word that names the reveal rather than at 50–55 % of speech | `src/audio.mjs:115-118` (accept a `wordAt(scene, phrase)` argument) | small; events are already a list | Chime lands on "fifty", not mid-word |
| 10 | **Piper inter-sentence pause** — insert 0.18–0.22 s of silence between concatenated phrases, matching Kokoro/Qwen | `src/neural-voice.mjs:28-35` | one loop change; shifts phrase timings only (still measured) | Removes run-together sentences in the voice tier actually used |
| 11 | **Id-based track join + overlap assertion** — join `tracks` to `plan.scenes` by `sceneId`, assert `scene.start + 0.35 + nar ≤ next.start`, assert every cue `at < duration` | `src/open-render.mjs:88-110`; same for `src/composition.mjs:257-274` | one helper, no schema change | Catches reorder/overlap drift before muxing |
| 12 | **Store and surface a listening verdict** — require `review.json.decision` before a job is marked distributable, and record `listeningCheckedAt/reviewer` in `quality-report.json` | `src/jobs.mjs:66-75`, report writers at `src/pipeline.mjs:166`, `src/open-render.mjs:124` | additive fields + one status rule | Makes the only currently-honest quality signal (a human) machine-visible |
| 13 | **Make the Manim render test run in CI** — load `.env` in `npm test` or auto-detect `.fair-open/venv/bin/python` | `package.json` test script; `test/open-render.test.mjs:101` | one script line | The real renderer path stops being skipped |

Suggested order: 2 → 4 → 1 (measurement before policy), then 6/7/10 (visible quality), then 8/9 (the beat-contract work).

---

## 7. Summary of verified vs inferred

**Verified by execution:** test counts and the skipped Manim test; `teaching-metrics` failing on the Manim project; ffprobe streams/durations/bitrates; motion metrics (18 % frozen / 76 % visible); volumedetect −18.0/−1.3 dBFS; per-scene durations and words; caption break analysis; frozen-second locations; empty music manifest; absence of bed/SFX files; absence of `pacing`/`motion` in the Manim quality report; frames extracted.

**Inferred (marked [I] where used):** real-world audibility of the synth bed under a voice; exact perceptual impact of the 0.35 s lead and AAC priming; that positional joins would desync under reordering; that the answer chime masks the next scene's first word; approximate LUFS from mean dBFS.

**Not determinable from this checkout:** what the HyperFrames path actually looks/sounds like (no job artefact exists); whether the licensed-music branch works (no tracks); whether ASR on the real Piper audio would flag mispronunciations (no ASR run — out of scope for read-only commands).
