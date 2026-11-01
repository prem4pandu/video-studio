# The Place-Value Shift — Production Specification

## Goal

By the final frame, a child can explain that multiplying 23 by 10 moves each digit one place left in a place-value chart: 2 tens become 2 hundreds, 3 ones become 3 tens, and zero occupies the empty ones place, so `23 × 10 = 230`.

## Output

- HyperFrames composition: 1920×1080, 30 fps, 16:9.
- Duration: 14.0 seconds × 30 fps = 420 frames, frames 0–419 inclusive.
- Delivery frame rate remains 30 fps. All timing below is frame-locked.
- One continuous apparent camera move with motivated editorial reframes; no black frame and no end card.

## Exact narration

> Twenty-three has two tens and three ones. Multiply by ten. Pull the lever. Each digit shifts one place left: two hundreds, three tens. Zero takes the empty ones place. Twenty-three times ten equals two hundred thirty.

Narration is 36 words. Target duration is 13.2 seconds, beginning at frame 9 and ending by frame 405, with a calm 164 words-per-minute average including natural micro-pauses. The equation remains visible after the final word through frame 419.

Pronunciation notes:

- Read `23` as “twenty-three,” not “two three.”
- Read `×10` as “times ten” in the final equation and “multiply by ten” at the lever.
- Read `230` as “two hundred thirty.”

## Educational proof

The film must show all four states in this order:

1. `23` is decomposed as 2 tens + 3 ones, with digit 2 in T and digit 3 in O.
2. The ×10 action begins while both digits remain visible.
3. The same digit tiles move together exactly one place left: 2 from T→H and 3 from O→T.
4. Only after O is visibly empty, a distinct zero tile occupies O, yielding H=2, T=3, O=0 and `230`.

The language is specifically “every digit moves one place left,” never the shortcut “just add a zero.” Zero is a place holder in the empty ones column; it is not shown pushing, transforming, or multiplying another digit. No intermediate frame may imply `23 × 10 = 23`, `203`, `320`, or `2300`.

## Look

- Ground: deep teal plaster and painted steel, `#0B3437`, with 3% mottled texture.
- Primary metal: aged brass `#B8893D`; roughness appearance 0.42; edge highlight `#E2BD70` at 18% width of each bevel.
- Glass: pale cyan `#BCE5DF` at 24% opacity with a 3 px warm rim; contents remain unobscured.
- Working light: amber `#F3A83B`, limited to the active column path, lever indicator, and final equation underline.
- Ink/numerals: warm ivory `#FFF2D2`; column labels use teal-black `#082629` on cream enamel `#E8D6AC`.
- Character: Mira occupies 42–55% of frame height when visible; warm brown skin, short wavy black bob, brass hair clip, burnt-orange jacket `#B7532B`, cream shirt, teal trousers.
- Display type: bundled geometric sans, weight 750; digits 164 px inside chambers; final equation 118 px; tracking −2%.
- Labels `H`, `T`, `O`: 48 px, weight 800; fixed above their columns for the entire proof.
- Body/annotation type: same family, weight 650, 46 px minimum. No prose panel.
- Camera: 35 mm equivalent for frames 0–239, easing to a 50 mm equivalent close composition for frames 240–419. Maximum total push is 9% of frame width; horizontal travel is 14% of frame width. No roll or handheld shake.
- Lighting: key from upper-left at a 35° angle; warm practicals at 2900 K; teal fill at 18% of key; amber rim at 32% of key only after lever contact.
- Depth: foreground brass edge at 7% frame width, machine in focus, background tool wall softened visually; 6% vignette and 2% grain only through the approved media-treatment pipeline.
- Action-safe margin: 96 px. All equations and column labels remain within the 80% title-safe region.

## Objects

- Place-value machine: three adjacent glass chambers labeled H, T, O from left to right. Each chamber has one centered digit rail and a lower counter shelf.
- Digit tiles: enamel-on-brass 2, 3, and 0; identical 156×196 px bodies. The 2 and 3 are visibly the same physical tiles before and after the shift.
- Tens evidence: two bundled brass rods on the T shelf, each bundle visibly banded and stamped with ten small divisions.
- Ones evidence: three separate ivory unit cubes on the O shelf.
- ×10 lever: 330 px brass arm with an 82 px burnt-orange handle and fixed enamel `×10` plate. Its pivot and gate linkage are visible so the shift has a cause.
- Shift track: one continuous rail connecting O→T→H; amber light travels left only after the lever reaches its detent.
- Zero dock: a small mechanical feeder aligned directly beneath O. It remains closed and unlit until the ones chamber becomes empty.
- Conclusion plate: integrated brass machine fascia, not a floating card; it holds `23 × 10 = 230`.

## Motion system

- Primary educational motion uses transform-only travel on fixed rails; opacity is never used to substitute for the digit shift.
- Lever anticipation: 9 frames, 3° upward preload. Pull: 18 frames through 52°, curve `cubic-bezier(0.55, 0.05, 0.72, 0.35)` to communicate weight. Detent settle: 6 frames, no bounce beyond 2°.
- Digit shift: both 2 and 3 begin on the same frame and travel one identical 286 px column pitch over 30 frames. Curve `cubic-bezier(0.22, 0.78, 0.22, 1)`; no overshoot because exact destination matters.
- Amber rail chase follows the leading edge by 3 frames and stops at the new columns; it never loops.
- Zero insertion begins only when “Zero” is spoken, after a 55-frame empty-O hold. It rises 84 px from the O dock over 15 frames with `cubic-bezier(0.2, 0.8, 0.25, 1)`, then settles 4 px over 4 frames. Transform origin is the dock.
- Counter transformation is a match handoff: the two ten bundles track into two hundred-value stacks in H, and the three unit cubes track into three ten-rods in T. Their motion is secondary, starts 4 frames after the digit tiles, and travels 62% of the digits' apparent distance.
- Camera motion is restrained and functional: one 42-frame lateral reveal, one 36-frame push toward the shifted result. No full-screen zoom, spin, whip pan, elastic text, or ambient loop.
- Text lands fully before its reading window. The final equation writes by mechanical shutters over 18 frames, then holds still for 70 frames.
- Reduced-motion alternative: preserve the same five teaching states with straight cuts at frames 0, 72, 174, 260, and 330. Digit origin and destination remain visible in consecutive frames; camera translation, parallax, and rail chase are removed.

## Sound

- Narrator: one warm, clear adult voice, −16 LUFS integrated target, peaks at or below −3 dBFS.
- Music: 92 BPM, 4/4; muted marimba, brushed frame drum, and two sustained string voices. No vocals. Music sits 10–12 dB beneath narration.
- Effects: three soft counter clacks at frames 24, 34, 44; lever grip leather creak at 126; weighted lever thunk at 153; leftward gear run frames 154–212; two digit-seat clacks at 211; zero feeder click at 260; zero-seat click at 278; low resolved brass-and-wood cadence frames 330–390.
- Duck music by 4 dB under every spoken phrase. Leave 6 frames of clean room tone before the first word and 18 frames after the last word.
- No sparkle sweeps, magical whooshes, trailer booms, or UI notification pings.

## Shot and timing plan

Although the result reads as one continuous move, the composition has six teaching shots. Every cut or reframe is caused by the machine action.

### Shot 1 — Build 23 · frames 0–71 · 2.4 s

- **Hero move:** Mira places the third unit cube into O as the camera tracks 8% right to reveal T and O together.
- **Visible truth:** T contains digit 2 and two bundled tens; O contains digit 3 and three separate ones. H is present but inactive. Large fascia display reads `23`.
- **Narration:** frames 9–84: “Twenty-three has two tens and three ones.”
- **Reading window:** `23` frames 0–71; `2 tens + 3 ones` appears as direct shelf labels frames 20–71, never as a detached caption.
- **Sound:** cube clacks at 24/34/44; music motif states 2 notes + 3 notes.
- **Handoff:** Mira's gaze and right hand move to the ×10 lever at frame 64.

### Shot 2 — Choose ×10 · frames 72–131 · 2.0 s

- **Hero move:** focus racks from the `23` fascia to Mira's hand wrapping the orange lever handle; the fixed `×10` plate fills 18% of frame width.
- **Visible truth:** the original 2 and 3 remain in T/O in the background; nothing has shifted yet.
- **Narration:** frames 85–119: “Multiply by ten.” Then frames 120–148: “Pull the lever.”
- **Reading window:** `×10` is legible frames 72–159 and is never replaced by prose.
- **Sound:** lever grip creak at 126; frame drum enters once.
- **Handoff:** the handle preload finishes upward at frame 131.

### Shot 3 — Cause the shift · frames 132–221 · 3.0 s

- **Hero move:** Mira pulls the lever to its detent; the rail illuminates leftward and both digit tiles translate one column left together.
- **Visible truth:** at frames 132–153, 2 is still in T and 3 in O. Shift begins frame 174: 2 travels T→H while 3 travels O→T. Both land by frame 203; O is empty frames 204–241.
- **Narration:** frames 151–256: “Each digit shifts one place left: two hundreds, three tens.”
- **Reading window:** compact origin arrows `T→H` and `O→T` attach to the moving rails frames 174–221. No floating legend.
- **Sound:** weighted thunk frame 153; gear run frames 154–212; synchronized seat clacks frame 211.
- **Handoff:** the camera follows the 3 tile and ends with empty O prominent on the right.

### Shot 4 — Occupy ones with zero · frames 222–281 · 2.0 s

- **Hero move:** hold the empty O for 20 frames; then its lower dock opens and the zero tile rises into O.
- **Visible truth:** H=2 and T=3 are already settled. O is unmistakably empty frames 204–258. Zero begins at frame 259 and is seated by frame 277. The displayed number changes from a spatial `2 3 _` to `230` only at frame 278.
- **Narration:** frames 259–331: “Zero takes the empty ones place.”
- **Reading window:** small attached label `empty ones` frames 222–259; it is mechanically covered by the arriving zero rather than faded away.
- **Sound:** dock click frame 260; zero-seat click frame 278.
- **Handoff:** amber light connects the three settled chambers H–T–O.

### Shot 5 — Read 230 by value · frames 282–329 · 1.6 s

- **Hero move:** 36-frame push toward the complete chart while Mira traces H, T, O once from left to right.
- **Visible truth:** H=2 above two hundred-value stacks; T=3 above three ten-rods; O=0 with no unit cubes. A single line beneath reads `2 hundreds + 3 tens + 0 ones`.
- **Narration:** the zero sentence continues over the completed chart through frame 331; its picture remains literal and still while the words finish.
- **Reading window:** decomposition frames 282–348, held still.
- **Sound:** gears settle; music resolves upward without a hit.
- **Handoff:** the chamber digits mechanically copy downward into the conclusion plate.

### Shot 6 — Conclude · frames 330–419 · 3.0 s

- **Hero move:** shutters reveal `23 × 10 = 230` from left to right over frames 330–347; everything then holds.
- **Visible truth:** the complete H/T/O machine remains behind the equation, so 230 stays connected to the proof. The answer 230 receives one 6 px amber underline, drawn frames 348–359.
- **Narration:** frames 333–405: “Twenty-three times ten equals two hundred thirty.”
- **Reading window:** full equation frames 348–419, 72 frames / 2.4 seconds.
- **Sound:** restrained cadence frames 330–390; final wooden note frame 390; room tone to frame 419.
- **End:** no logo, CTA, confetti, or extra example. Last frame is the proved equation and intact place-value chart.

## Banned

- “Just add a zero,” a zero appearing before the ones place is shown empty, or any digit changing identity during the shift.
- Generated or rasterized mathematical text; all digits, operators, arrows, and labels must be deterministic and frame-accurate.
- Black/navy voids, floating objects without a workshop, neon glow, bloom, lens flares, magical particles, purple/blue gradients, mesh gradients, or glass cards.
- Cream editorial paper, serif headlines, italic accent words, monospace micro-labels, pills, HUD corners, decorative brackets, three-card rows, KPI layouts, or a docked logo.
- Generic conveyor-belt infographic, floating equation card, classroom chalkboard cliché, slot-machine digit roll, or digits hopping independently.
- Everything centered; repeated fade-and-slide entrances; opacity-only educational transitions; titles drifting after landing; perpetual gear rotation; breathing or pulsing loops.
- Whip pans, crash zooms, camera roll, random shake, excessive parallax, elastic overshoot on digits, or bouncy zero insertion.
- Extra characters, decorative dialogue, a second multiplication example, practice question, or any closing brand card.

## QA frames

- **Frame 0:** no black frame; Mira, 23, T/O chambers, two tens, and three ones establish the problem immediately.
- **Frame 44:** exactly two tens bundles and three unit cubes; digit 2 is in T, digit 3 in O.
- **Frame 100:** ×10 plate is fully legible; 2 and 3 have not moved.
- **Frame 153:** lever reaches weighted detent; digits remain at their origins immediately before shift.
- **Frame 174:** both digit tiles begin leftward on the same frame.
- **Frame 189:** 2 and 3 are midway on parallel rails with clear origin/destination columns; neither overlaps a wrong column center.
- **Frame 203:** 2 is centered in H, 3 centered in T, O empty.
- **Frame 230:** empty O holds long enough to read; no zero is yet visible.
- **Frame 277:** zero is centered in O; H/T digits have not drifted.
- **Frame 300:** chart reads H=2, T=3, O=0 with exact decomposition `2 hundreds + 3 tens + 0 ones`.
- **Frame 348:** full exact equation `23 × 10 = 230` is visible; multiplication sign is `×`, never letter x or asterisk.
- **Frame 390:** narration and musical resolution agree with the proved answer; equation and chart remain still.
- **Frame 419:** final frame is complete, sharp, title-safe, and contains no logo or unrequested text.

Automated checks must verify 1920×1080, 30 fps, exactly 420 frames, no media overrun, no network dependency, one paused deterministic timeline per composition, and no unseeded randomness. Human review must confirm mathematical correctness, child comprehension, stable digit identity, lever-to-shift causality, unobscured labels, narration intelligibility, and no banned defaults.
