# Decimal teaching prototype

An isolated, curated production test for ages 9–10. It tests local Qwen narration,
Qwen alignment, a Blender-authored original robot, deterministic mathematical
animation, captions and HyperFrames preview/export. It does **not** test autonomous
lesson writing, educator approval, or children's learning outcomes.

The worked example is 3.47; the practice example is 2.63. Integer hundredths are
used for arithmetic validation. The four-second practice pause is preserved.

## Reproduce

Run from the app root, with the existing Qwen models installed:

```sh
blender --background --factory-startup --disable-autoexec --python scripts/fair-decimal-blender.py -- .fair-video/decimal-pilot/assets
ffmpeg -framerate 24 -i .fair-video/decimal-pilot/assets/motion/robot-%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 24 -auto-alt-ref 0 .fair-video/decimal-pilot/assets/robot-intro.webm
node --env-file-if-exists=.env scripts/fair-decimal-pilot.mjs
```

The first run used verified Blender 4.5.11 LTS, temporarily mounted read-only at
`/private/tmp/video-studio-blender`. It did not install Blender into Applications.
Its official macOS ARM64 DMG SHA-256 was
`1fad76c7da9451c7d6db99f1a5ed3c0a1a461d0aa07bf2b639e2fb4804ca4f13`.

The project was scaffolded with HyperFrames and its isolated CLI pin upgraded from
0.8.161 to 0.8.176. The app's package pin is unchanged. Inside the generated project:

```sh
npx --yes hyperframes@0.8.176 check --json --at 2,10,17,26,34,41,50
npx --yes hyperframes@0.8.176 preview --background --port 4320
```

Review `http://localhost:4320/#project/decimal-pilot` before approving export.
Export after approval:

```sh
npx --yes hyperframes@0.8.176 render --quality looks --fps 30 --output decimal-workshop.mp4
```

## Evidence and limitations

- Generated artifacts and source compositions: `.fair-video/decimal-pilot/`.
- `pilot-report.json` and `narration-manifest.json` record scope, timings and hashes.
- `independent-transcription.json` records Whisper base.en output without script
  prompting. ASR recovered the decimal numbers but ambiguously rendered
  "hundredths" in two sections; a human listening review is still required.
- The aligner sometimes gives a short function word zero duration at its 80ms
  resolution. The prototype retains those merged boundaries, groups captions,
  and refuses an ambiguous mathematical action cue. Production validators are
  unchanged.
- Teaching animation uses native WAAPI. Studio currently uses the existing GSAP
  3.14.2 dependency as its timeline clock; GSAP has a custom licence. This test
  must not be described as an entirely permissively licensed stack.
- The guide performs a short introductory gesture and then holds a pointing pose
  during the explanation. This is not a fully acted character episode.
- Keep Python environments outside the HyperFrames project directory; Studio's
  recursive HTML discovery otherwise treats dependency HTML files as compositions.
- No educator approval, learner pilot, music, diffusion footage, lip-sync,
  public publishing, or paid service was tested.

The isolated independent-ASR environment is `.fair-video/decimal-asr-venv/`, with
`mlx-whisper==0.4.3`. To repeat its check:

```sh
.fair-video/decimal-asr-venv/bin/python scripts/fair-decimal-transcribe.py .fair-video/decimal-pilot
```

The recorded initial duration is 54 seconds, longer than the originally proposed
30–45-second excerpt because the full explanation and practice pause were retained.
