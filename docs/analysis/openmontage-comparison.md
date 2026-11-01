# OpenMontage lesson comparison — 2026-11-01

**Recommendation: retain Video Studio's pipeline. Adopt clearer scene planning and presentation; do not migrate the backend on this evidence.**

## Deliverables

- [Synchronized comparison](../../outputs/openmontage-comparison/side-by-side.mp4)
- [OpenMontage experiment](../../outputs/openmontage-comparison/openmontage-lesson.mp4)
- [Existing Video Studio lesson](../../.fair-video/cfa9525f-17d6-418b-8762-7005b905ee36/project/lesson.mp4)
- [Comparison frame at 45.5 seconds](../../outputs/openmontage-comparison/comparison-frame.png)
- [Measured results](../../outputs/openmontage-comparison/comparison-metrics.json)
- [Editable composition](../../outputs/openmontage-comparison/hyperframes/index.html)

## Experiment boundary

One existing place-value draft, seven scenes, 75.333 seconds, 1280×720 at 30 fps. Same narration script and identical decoded audio in both files. The input is **not educator-approved**: its review record says needs-changes and identifies an automated E2E review. Neither result is approved for classroom publication.

OpenMontage commit `195eab24478dc9363326aec437aefc3701635ddf` was cloned into `/private/tmp/video-studio-openmontage`. Its animated-explainer scene/edit/compose guidance informed a bespoke HyperFrames composition. Existing script/narration were imported, schemas validated, and its real registry-discovered `HyperFramesCompose.render_existing` tool checked and rendered the workspace. HyperFrames stayed pinned to the already-installed `0.8.161`.

This is a controlled **agent-authored presentation and render-adapter experiment**, not a full autonomous OpenMontage research/planning/provider benchmark. The quality differences come from newly authored scenes, not from automatically applying a default template. The arithmetic quantities and lesson remain the same; the geometry, layouts, caption chunks and visual cue targets were re-authored. There is no evidence here that adopting the whole repository improves unattended lesson generation.

No paid media APIs or new model downloads. Agent usage, electricity and authoring effort are not included in the $0 media-API cost. No production application files were changed. Artifacts live in the existing git-ignored `outputs/` directory.

## Results

| Check | Existing draft | OpenMontage experiment |
|---|---:|---:|
| Duration | 75.333 s | 75.333 s |
| Resolution / fps | 1280×720 / 30 | 1280×720 / 30 |
| Narration integrated loudness | −16.9 LUFS | −16.9 LUFS |
| Full-frame frozen-second share | 18% (14/76 bins) | 28% (21/76 bins) |
| Teaching-region frozen share, excluding question | 30.2% (19/63 bins) | 46.0% (29/63 bins) |
| Encoded size | 1,462,364 bytes | 1,729,053 bytes |
| Educator approval | No | No |

Full-frame motion uses the repository's `motionMetrics`. The teaching-region measurement crops both videos to 1280×550, excludes seconds 47–60 (question plus boundaries), and counts a second as frozen when its maximum grayscale frame difference YAVG is below 0.05. These are motion proxies, not learning-effectiveness scores. Intentional readable holds can be beneficial, and captions can make a static teaching diagram appear active.

The exact source script is preserved. Decoded PCM SHA-256 matches in both files: `cf11695b63f0e595005a28da184f604602708ba2932af4857df5db0bf07deb22`. Final audio was stream-copied from the baseline after rendering to eliminate HyperFrames re-encoding as a comparison variable.

## Visual findings

- **Improved:** larger diagrams and type; distinct layouts for digit/place, grouping, misconception, question, answer and recap. The misconception explicitly strikes out the wrong claim and distinguishes digit 3 from value 30. The question displays numeral 52 immediately, with five countdown marks and no answer.
- **Still weak:** long holds remain, particularly in the concept scene. The experiment is less animated by both measured definitions. Captions still occasionally split clauses. Reusing the script preserves its weaknesses, including spoken UI instructions and a narrow recap.
- **Correctness evidence:** generated unit counts are asserted: 37 before/after grouping, 50 units in five tens. Source equations remain unchanged. Sampled frames were inspected, including grouping, misconception, question and answer. This is not an exhaustive frame-by-frame mathematical proof.
- **Timing evidence:** authored cue times use saved forced-alignment word timestamps plus the source's 0.35-second speech offset. Cue targets are saved in `artifacts/cue-evidence.json`. Actual visual-to-phoneme error was not measured; no p95 synchronization claim is made.
- **Audio:** measured and checked for identical decoded samples; not listened to or round-trip transcribed during this experiment.

## Integration findings

The first invocation rendered a valid MP4 but returned failure because HyperFrames automatically added `data-hf-id` editor metadata, triggering OpenMontage's source-digest guard. The diff contained only those attributes. Initializing that metadata before the second invocation resolved the failure without changing OpenMontage code. Both attempts are saved.

The successful runtime/layout/contrast check contained **motion.enabled=false**. The independent motion measurements are therefore essential. A render-tool success is not a teaching-quality pass.

The renderer itself was fast on Apple M5 Pro with hardware capture, but the lesson required bespoke agent authoring. No fresh baseline render was timed, so this is not a renderer-speed comparison. The OpenMontage repository remains separate; no AGPL source was copied into the product.

## Next implementation priorities

1. Bring the explicit digit/value contrast and clear question layout into our existing visual renderers.
2. Implement the planned word-anchored action timeline so teaching changes continue through each explanation.
3. Make teaching-region motion and question/answer checks actionable in our existing review flow.
4. Consider OpenMontage later for a separate documentary/stock-media workflow, where its breadth offers more differentiation.

## Evidence

Environment: macOS / Apple M5 Pro; Node 24; HyperFrames 0.8.161; FFmpeg; isolated Python 3.9 environment. The selected OpenMontage adapter runs in this environment, although upstream recommends Python 3.10+. Full-registry discovery initially failed on an uninstalled optional provider dependency; targeted discovery of the HyperFrames module succeeded. This is not a claim that the full OpenMontage stack was installed or validated.

| Command / action | Exit | Result |
|---|---:|---|
| OpenMontage JSON-schema validation: script, scene_plan, asset_manifest, edit_decisions | 0 | All four pass |
| `hyperframes lint outputs/openmontage-comparison/hyperframes --json` | 0 | No findings |
| OpenMontage `run-openmontage.py render_existing`, attempt 1 | 1 | MP4 rendered; metadata-only source-integrity failure |
| Same command, attempt 2 with editor IDs initialized | 0 | Check and render succeed; authored entry preserved |
| `python3 outputs/openmontage-comparison/verify.py` | 0 | Script/audio identity, resolution/fps/duration, unit count and answer-free question assertions pass |
| Repository `motionMetrics` on both final files | 0 | Results above |
| FFmpeg synchronized side-by-side encode | 0 | Playable comparison MP4 |
| Local preview HTTP check, port 4315 | 0 | HTTP 200 |

`build.py`, `run-openmontage.py`, `verify.py`, source artifacts, raw check results and both invocation reports are retained with the output. The source checkout is temporary and may need recloning at the pinned commit for future reproduction. Initializing editor IDs with HyperFrames before invoking OpenMontage avoids the first-run digest issue. No application-wide test suite was run because application code was untouched.
