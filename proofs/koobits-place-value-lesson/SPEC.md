# Multiplying Whole Numbers by 10 — Production Specification

## Goal

An age 7–10 learner will explain and use the place-value effect of multiplying a whole number by 10: every digit takes the place immediately to its left, making its value ten times as great; zero records the newly empty ones place. The learner will follow the worked example `23 × 10 = 230`, complete guided `41 × 10 = 410`, and independently answer `47 × 10 = 470`.

## Output

- HyperFrames, 1920×1080, 30 fps, 16:9.
- Runtime: 280 seconds × 30 fps = 8,400 frames, frames 0–8,399.
- Nine chapters with exact boundaries: Hook 0–12; Goal 12–30; Build 23 30–65; Predict 65–85; Prove 23 85–125; Misconception repair 125–155; Guided 41 155–200; Independent 47 200–250; Recap 250–280.
- One persistent left-to-right `Hundreds | Tens | Ones` coordinate system. Chapter changes may reframe it but may not reverse or relabel it.
- Voice-led lesson. Exact narration and silence windows are in `SCRIPT.md`.

## Learning architecture

1. **Diagnose/predict:** ask where the digits will move before revealing it.
2. **Concrete:** represent 23 with two ten-rods and three unit cubes.
3. **Pictorial:** exchange two tens for two hundreds and three ones for three tens, then place those values into H–T–O.
4. **Symbolic:** connect `(20 × 10) + (3 × 10)` to `200 + 30 = 230`.
5. **Repair:** contrast place-value reasoning with the unsafe phrase “just add a zero.”
6. **Guided application:** solve 41 with prompts that disappear after use.
7. **Independent transfer:** solve 47 without a worked animation before the learner commits.
8. **Retrieval recap:** state the rule, the role of zero, and all three examples.

## Look

- Ground: warm pale sand `#F5E9CE`, never a black void.
- Structure: deep teal `#103E3D`; active teaching path: amber `#F2B633`; error contrast: brick `#B64732`; success: leaf `#2F7658`.
- Concrete objects: unit cube 56×56 px; ten-rod 56×560 px with ten visible 56 px divisions; hundred-flat 560×560 px with a visible 10×10 grid.
- Column grid: three 420 px columns, 18 px gutters, 6 px divider rules. Headers are 52 px, weight 800. Each object center must remain inside its logical column except during a visible exchange path.
- Numerals: bundled geometric sans, weight 800; chamber digits 176 px; equations 92–128 px; explanatory labels at least 42 px.
- Text contrast: minimum 4.5:1 for body copy, 3:1 for 72 px+ display text. Maximum 11 words in any instructional line.
- Character: Mira is limited to an operator hand, facial reaction, or pointing gesture occupying no more than 25% of the frame during explanations. Mathematical objects occupy at least 60% of the active frame.
- Environment: brass-and-enamel workshop around the chart, but no scenic shot may run without an instructional object or question.
- Lighting: 35° upper-left warm key, soft neutral fill at 35% of key, subtle teal rim at 20%; no bloom, lens flare, or magical particles.
- Camera: 40–55 mm equivalent; maximum push 8%, pan 12%; no roll, shake, whip, crash zoom, or decorative orbit.

## Mathematical representation

- Start 23: `2 tens = 20` and `3 ones = 3`; concrete inventory is exactly two ten-rods and three unit cubes.
- Multiply each value: `2 tens × 10 = 2 hundreds = 200`; `3 ones × 10 = 3 tens = 30`.
- Result inventory: exactly two hundred-flats, three ten-rods, and zero unit cubes.
- Place-value result: H=2, T=3, O=0.
- Symbolic chain: `23 × 10 = (20 × 10) + (3 × 10) = 200 + 30 = 230`.
- Guided 41: four tens + one one → four hundreds + one ten + zero ones → 410.
- Independent 47: four tens + seven ones → four hundreds + seven tens + zero ones → 470.
- Every multiplication sign is `×`; never the letter x or an asterisk.

## Motion

- Every animation must express counting, exchange, spatial relationship, feedback, or continuity. No ambient loops.
- Concrete objects appear by physical placement, 10–16 frames each; never fade in as a substitute for counting.
- Exchange motion: a ten-rod enters the ×10 gate and unfolds into a hundred-flat over 30 frames; a unit cube enters and extends into a ten-rod over 24 frames. Original and result share color and continuous position so object identity is trackable.
- Digit shift: all digits move one 420 px column pitch left over 30 frames, `cubic-bezier(0.22, 0.78, 0.22, 1)`, with no overshoot.
- Zero enters only after the ones column has been visibly empty for at least 24 frames. It rises from a placeholder dock over 18 frames, then remains still.
- Guidance arrows draw from source to destination and disappear once the corresponding move lands; no arrow crosses an unrelated digit.
- Correct choices settle with one 10-frame green outline. Incorrect choices receive one 8-frame brick side nudge, then a causal correction; no buzzer, shake loop, or humiliation.
- Thinking windows hold completely still except for a single shrinking time bar. Music reduces by 6 dB and narration stops.
- Reduced motion: use direct state cuts while preserving source and destination frames, counts, empty-ones hold, and all reading windows. Remove camera motion and object morphs, not instructional states.

## Sound

- Narration target: −16 LUFS integrated, peaks ≤−3 dBFS, 135–155 spoken words per minute outside intentionally slower equations.
- Music: 88 BPM, marimba, muted strings, hand percussion; −27 LUFS under voice and −33 LUFS during prediction/independent thinking.
- Sound effects: wood placement clicks, brass lever detent, paper/wood exchange folds, quiet column-seat clacks, success chord. Effects remain at least 8 dB below narration.
- No trailer booms, magical whooshes, slot-machine sounds, notification pings, canned cheering, or vocals.

## Chapter specification

### 1. Hook · 0:00–0:12 · frames 0–359

- Frame 0 shows two ten-rods, three cubes, `23 × 10 = ?`, and the ×10 lever.
- Learner question: what changes when 23 is made ten times as great?
- Character/environment establish context only while those instructional objects remain dominant.

### 2. Goal · 0:12–0:30 · frames 360–899

- Goal line: `Explain ×10 using place value`.
- Preview the concrete, pictorial, and symbolic representations as three connected states, not three cards.
- State success criterion: explain where each digit moves and why zero is needed.

### 3. Build 23 · 0:30–1:05 · frames 900–1,949

- Count and place exactly two ten-rods in Tens and three cubes in Ones.
- Connect concrete amounts to `20 + 3 = 23`.
- Hundreds remains visible and empty.

### 4. Predict · 1:05–1:25 · frames 1,950–2,549

- Ask whether digits stay, move left, or move right.
- Provide a 7-second silent decision window.
- Commit to “one place left” only after the pause.

### 5. Prove 23 · 1:25–2:05 · frames 2,550–3,749

- Exchange two ten-rods into two hundred-flats, then three cubes into three ten-rods.
- Translate those quantities to H=2, T=3; hold O empty; insert 0; finish the full symbolic chain.
- This is the only worked example and receives the slowest motion.

### 6. Misconception repair · 2:05–2:35 · frames 3,750–4,649

- Show “just add a zero” as a shortcut claim, not as the rule.
- Reveal the causal order: 2 and 3 change places first; then 0 records no ones.
- Briefly state that append-zero language is unsafe beyond whole numbers; do not begin a decimal lesson.

### 7. Guided 41 · 2:35–3:20 · frames 4,650–5,999

- Prompt learner to name 4 tens + 1 one, destinations, empty column, and answer.
- Give 3–4 second pauses after each prompt.
- Show destination arrows for the first prompt, then remove them before the final answer.

### 8. Independent 47 · 3:20–4:10 · frames 6,000–7,499

- Present `47 × 10 = ?` with manipulatives available but no animated solution.
- Give 12 seconds silent thinking, then a commit instruction and 6 seconds to answer.
- Reveal and verify 470 by H/T/O values, not by answer-only celebration.

### 9. Recap · 4:10–4:40 · frames 7,500–8,399

- Retrieve the rule and zero's role.
- Revisit 23, 41, and 47 for 3 seconds each with H/T/O alignment.
- End on `value changes because place changes` and `47 × 10 = 470`; no logo or CTA.

## Banned

- Scenic B-roll without an instructional object, floating lesson cards over irrelevant footage, decorative character acting, or a delayed start to the mathematics.
- “Just add a zero” presented as the governing rule; zero pushing digits; zero appearing before O is empty; digits moving two places; digits swapping identity.
- Answer reveal before a prediction/independent pause; narration during silent thinking windows; celebratory effects before reasoning is verified.
- Generated/raster mathematical text; AI-generated counters; counts that do not exactly match the equation.
- Dark voids, glass cards, neon, bloom, particles, gradients, serif editorial styling, monospace micro-labels, HUD decoration, pills, three-card rows, or docked logo.
- Repeated fades/slides, looping gears, breathing titles, bounce on place-value landings, random camera movement, or text moving while read.

## QA

- Frame 0: exact two ten-rods + three cubes and unanswered `23 × 10 = ?`.
- Frame 1,500: T contains two rods, O contains three cubes, equation reads `20 + 3 = 23`.
- Frames 2,220–2,429: prediction answer remains unrevealed and narration is silent for seven seconds.
- Frame 2,820: two hundreds emerge from the same two tens; no extra object.
- Frame 3,120: three tens emerge from the same three ones.
- Frame 3,450: H=2, T=3, O visibly empty; zero has not arrived.
- Frame 3,630: H=2, T=3, O=0, exact inventory 2 hundreds + 3 tens + 0 ones.
- Frame 3,690: exact symbolic chain ends at 230.
- Frame 4,200: misconception panel states causal order and does not endorse append-zero language.
- Frame 5,700: guided 41 is 410 with H=4, T=1, O=0.
- Frames 6,210–6,569: independent answer remains hidden and narration is silent for twelve seconds.
- Frame 7,260: independent answer is 470 with H=4, T=7, O=0.
- Frame 8,399: recap is complete, no logo, no new task, no wrong or ambiguous notation.
- Automated: 1920×1080, 30 fps, 8,400 frames; deterministic paused timelines; no network fetches or unseeded randomness; all text title-safe; no media overrun.
- Human: child can explain the transformation, distinguish 230 from 203/2300, complete 47 independently, and state that zero records an empty ones place.
