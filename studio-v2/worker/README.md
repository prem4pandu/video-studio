# OpenMontage worker

`npm run setup:studio-v2` creates an isolated `.openmontage` checkout at commit
`195eab24478dc9363326aec437aefc3701635ddf` and a Python 3.10+ virtual environment.
Only the local HyperFrames adapter is installed; no paid-provider SDKs or model
weights are needed for this worker. Upstream remains AGPL-3.0 and its license is
retained in the checkout.

```js
import {workerReadiness, renderWithOpenMontage} from './index.mjs';
const readiness = await workerReadiness({env: process.env});
const result = await renderWithOpenMontage(workspace, outputFile, {
  env: process.env, signal, onProgress,
});
```

The Python bridge discovers `hyperframes_compose` through OpenMontage's registry
and calls its real `render_existing` implementation. Its runtime/layout/contrast
gate, encoding, and authored-entry hash guard must succeed. No direct-FFmpeg or
alternate-engine success fallback exists.

Three compatibility choices are recorded in every result:

- Use the installed HyperFrames **0.8.161** executable, rather than upstream's
  unpinned `npx` execution and npm package lookup.
- Run the real CLI doctor and require Node, FFmpeg, FFprobe, Chrome and sufficient
  disk. Optional TTS, Docker, cloud and newer-version availability are not local
  render prerequisites. Doctor may check for upgrades, but an offline registry
  does not make this installed renderer unavailable.
- Initialize editor IDs using `hyperframes timeline ids` before upstream hashes
  `index.html`, avoiding metadata-only source changes during the render.

`openmontage-worker.log` records progress, and `openmontage-result.json` records
the complete result, commit, license, Python/CLI versions and upstream tool source
hash. Failure is an exception in the JS caller. Cancellation/timeout terminates
the worker's process group, including its Node, Chrome and FFmpeg descendants.

The worker's pass proves technical render checks, not educational correctness or
publishability. The parent pipeline must verify media, narration, semantic
constraints and meaningful motion, and retain a human review state.

Environment overrides:

| Variable | Default |
|---|---|
| `STUDIO_V2_OPENMONTAGE_DIR` | `<repo>/.openmontage` |
| `STUDIO_V2_PYTHON` | `<checkout>/.venv/bin/python` |
| `STUDIO_V2_RENDER_TIMEOUT_MS` | `2100000` (35 minutes) |
| `STUDIO_V2_SETUP_SOURCE` | Official GitHub repository; setup only |
| `STUDIO_V2_SETUP_PYTHON` | Homebrew Python 3.12 if present, else `python3`; setup only |

The setup script refuses to overwrite an existing mismatched or modified
checkout. Choose an empty override directory for another install. The bridge
also refuses a mismatched commit or modified tracked source on every run.
