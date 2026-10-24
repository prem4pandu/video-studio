# Place-Value Machine proof

This is the first deterministic 60-second proof film for the cinematic educational-video pipeline. See `SPEC.md` for the locked brief, `production-plan.json` for the renderer-independent shot plan, and `REVIEW.md` for the measured quality verdict and limitations.

## Run

```sh
npm run check
npm run dev
npm run render -- --quality delivery --output out.mp4
```

From the repository root, verify the encoded master with:

```sh
npm run check:proof
```
