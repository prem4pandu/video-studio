# Local narration

Studio V2 defaults to `STUDIO_V2_VOICE=qwentts`: the installed Qwen3-TTS VoiceDesign 8-bit model with the designed Indian-English teacher profile in `content/voices/teacher.json`. It is a synthetic persona, not a cloned person. Qwen uses the local MLX runtime and requires an Apple Silicon GPU available to the server process.

Configure these paths when they differ from the defaults:

```dotenv
STUDIO_V2_VOICE=qwentts
FAIR_QWEN_PYTHON=.fair-neural/qwen-venv/bin/python
FAIR_QWEN_MODEL_DIR=.fair-neural/qwen-voice-design-8bit
FAIR_QWEN_PROFILE=content/voices/teacher.json
FAIR_QWEN_SYNTHESIS_UNIT=scene
```

The Python environment needs the installed `mlx-audio`, `mlx`, NumPy and SoundFile packages. The model directory needs its configuration, tokenizer files, nonempty model safetensors and `speech_tokenizer/model.safetensors`. The readiness check validates the profile, required assets and actual runtime/GPU import. It does not synthesize on every readiness request. Missing files or unavailable GPU access produce a setup error; no different voice is substituted.

There is currently no Qwen bootstrap command in this repository. `scripts/setup-voice.mjs` installs **Piper**, not Qwen. On this development machine Qwen's environment and weights are already installed. Another machine must provision those local assets before selecting Qwen. The model and pinned revision are recorded in the teacher profile.

`scene` synthesis keeps sentence transitions in a single generation. `FAIR_QWEN_SYNTHESIS_UNIT=phrase` restores the older sentence-by-sentence behavior explicitly. Audio fingerprints include the synthesis unit and complete profile (including seed and direction), so changing the persona regenerates narration. A fixed seed improves reproducibility but does not guarantee identical speaker characteristics across different scripts.

Select `STUDIO_V2_VOICE=kokoro` or `piper` explicitly when desired. Kokoro's voice and speed use `FAIR_KOKORO_VOICE` and `FAIR_KOKORO_SPEED`. V2 rejects remote Kokoro URLs because this workflow uses local voices. Keep `FAIR_ALIGNMENT_MODEL_DIR` configured for measured word timing; uninterrupted scene synthesis itself provides scene boundaries, not exact word timestamps.

## Same-text evaluation

The voice-quality revision compared four exact clips from the final lesson, social explainer and story: 88 words total. Evidence lives in `outputs/studio-v2-voice-review-continuous/`.

| Measurement | Kokoro `bf_emma` | Qwen teacher, continuous scenes |
|---|---:|---:|
| Synthesis time, four clips | 6.77 s | 14.59 s |
| Speech rate across clips | 164–182 words/min | 132–154 words/min |
| Independent ASR word edits | 3 / 88 | 2 / 88 |
| Clipped samples | 0 | 0 |

Qwen's two ASR differences were “whole” rendered as “hole”; all other normalized words matched. Kokoro additionally produced a “strong”/“stronger” recognition difference. The previous Qwen sentence-by-sentence mode had a short “You have” recognition error that disappeared in continuous synthesis. Qwen showed greater measured pitch variation and longer pauses. These are descriptive measurements, **not proof of naturalness, emotional quality or stable speaker identity**. Pitch estimates can contain octave errors. There was no human listening review.

The selected default favors the slower, more varied Qwen delivery and removes artificial sentence restarts. Listen to the paired audition files before approving the persona for publication. The comparison report includes per-clip pace, internal pauses, integrated LUFS, true peak and pitch statistics; independent ASR reports include hashes and exact word differences.

Reproduce on this configured machine:

```bash
node --env-file-if-exists=.env scripts/compare-studio-v2-voices.mjs outputs/voice-comparison
.fair-video/decimal-asr-venv/bin/python scripts/verify-studio-v2-speech.py outputs/voice-comparison/qwentts
.fair-video/decimal-asr-venv/bin/python scripts/verify-studio-v2-speech.py outputs/voice-comparison/kokoro
.fair-neural/qwen-venv/bin/python scripts/measure-studio-v2-voices.py outputs/voice-comparison
```

The audition disables alignment to compare synthesis alone; normal production retains configured forced alignment. ASR uses cached Whisper weights offline without any script prompt. GPU access must be permitted for Qwen and Whisper.
