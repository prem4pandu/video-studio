# Cinematic benchmark review

## Decision

`candidate.mp4` is the current local winner and the first accepted visual-quality proof. It passes the automated delivery gate and the locked shot reads as a publishable animated-film insert rather than a motion-graphics prototype.

This decision proves the reference-image → Wan motion → deterministic delivery/QA path on Apple silicon. It does not establish that the local route is the final maximum-quality production renderer: the official 1280×704, 121-frame run exceeded the machine's memory, and the NVIDIA candidates have not yet been generated.

## Selected candidate

- Source: Wan 2.2 TI2V-5B, 832×480, 81 frames, 16 fps, 20 Euler steps.
- Conditioning: `assets/reference/mira-brass-workshop-v1.png`.
- Delivery: Lanczos upscale to 1280×720 and cadence conversion to 24 fps; no motion interpolation.
- Duration: 5.083 seconds.
- Delivery SHA-256: `9d6feb25be848f49c0d17dc7c0356d153556da9c3bea4f752966c61c526d0ed7`.
- Audio: intentionally absent; this benchmark isolates visual generation quality.

## Iterations

1. The 512×288, 17-frame smoke test proved the graph and memory route but was rejected for minimal motion and a late green artifact.
2. The first 832×480 candidate preserved identity and production design but was rejected because Mira reacted beside the lever instead of pulling it.
3. The prompt was narrowed to a locked camera and explicit timed action. The second 832×480 candidate was accepted: Mira grasps and lowers the lever with visible body effort, remains in contact, and the amber machine chambers activate.

## Measured

- Complete H.264 decode with no FFmpeg errors.
- 1280×720, 24 fps, 5.083 seconds.
- No black spans.
- Longest detected frozen span: 0.083 seconds, below the 0.125-second limit.
- Reference, prompt, workflow, model files, and output are content-hashed in provenance.
- All model files passed their pinned SHA-256 checks before inference.

## Looked at

- Mira retains the approved face, hair, costume, age, and proportions.
- Both visible hands remain anatomically readable and make believable lever contact.
- The lever action has anticipation, effort, follow-through, and a readable settled state.
- Brass machinery and workshop geometry remain coherent without visible background warping.
- Lighting progresses from teal/amber balance to motivated amber activation.
- No words, numerals, watermarks, or accidental symbols appear.

## Known limitations

- The accepted local source is 832×480 and upscaled; it is not native 720p generation.
- The native 1280×704/121-frame Apple run failed with a 66.54 GiB attention-buffer request.
- The human review is frame- and motion-read based; no second independent human reviewer watched the clip.
- Identity, pose, and hand checks are not yet backed by ArcFace/MediaPipe metrics.
- There is no dialogue, neural voice, lip sync, music, or Foley in this isolated visual benchmark.
- Wan 2.2 TI2V-5B is now the proven local draft renderer. The pinned 24 GB NVIDIA TI2V-5B run and 80 GB A14B escalation remain the required comparison before declaring the final production renderer.

## Next gate

Run `wan-cloud/run.sh` on a 24 GB or larger NVIDIA host using the same reference and prompt, then pass the resulting clip through `npm run check:cinematic-benchmark` and the same human review. Adopt the cloud candidate only if it improves native detail or action stability without reducing identity, anatomy, or teaching clarity.
