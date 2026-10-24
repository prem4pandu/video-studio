# Proof review

## Verdict

The deterministic proof is delivery-valid and visually coherent. It establishes a repeatable quality floor for timing, typography, instructional correctness, continuity, audio presence, and encoded output. It is not yet evidence that the Wan/LTX/Kandinsky routes can produce cinematic character footage; those routes require a separate generative-shot benchmark on configured model hardware.

## What was measured

- HyperFrames composition check: 0 errors, 0 warnings.
- Review capture: 16 beat frames, 7 transition seams, and a phone-scale sheet.
- Delivery master: H.264/AAC, 1920×1080, 30 fps, exactly 60.000 seconds.
- Audio mean volume: -29.3 dBFS.
- Artifact size: 9,197,819 bytes.
- SHA-256: `99f9a50b898c574133e048a7bf0a7b17f49e67727b73cb2f5790deda042ecd3d`.
- Repository tests: 141 passed, 1 skipped, 0 failed.

## What was visually reviewed

- The brass, teal, charcoal, and amber palette remains continuous across all eight shots.
- Mira and Ari keep their screen positions and costume colors.
- Captions remain readable at desktop and phone review scale.
- The question shot contains no answer; the answer appears only after the thinking interval.
- All equations and place-value transitions are correct: `23 × 10 = 230` is demonstrated and `47 × 10 = 470` is resolved.
- Scene seams are intentional hard editorial cuts and contain no blank or malformed frames.

## Creative calls

The selected “Brass Workshop” treatment uses tactile machinery to make an abstract place-value transformation feel physical. The unbuilt alternatives were “Night Train” and “Shadow Theatre”; they offered stronger spectacle but weaker instructional legibility and greater continuity risk for the first proof.

## Weakest shot

Shot 5 is the least cinematic frame because it carries the most explanatory labels. It remains readable, but a future diffusion-assisted version should communicate the zero placeholder through action and staging before adding text.

## Known limitations

- Characters are deterministic vector rigs rather than model-generated performances.
- Narration uses local system voices, not the intended neural character TTS.
- There is no phoneme-driven lip sync in this baseline.
- Music and effects are locally synthesized placeholders rather than a mastered cinematic score.
- No Wan 2.2, LTX, or Kandinsky inference was claimed or fabricated; the production-plan contract and fallbacks are implemented, but model execution still depends on configured checkpoints and GPU services.

## Next quality gate

Replace one controlled establishing shot and one close character shot with versioned Wan/LTX outputs, retaining the deterministic overlays and exact audio timeline. The next proof passes only if character identity, temporal stability, composition, and lip-sync measurements beat this baseline without reducing mathematical clarity.
