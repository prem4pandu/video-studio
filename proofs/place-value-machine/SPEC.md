# The Place Value Machine — Production Spec

## Goal

The viewer should feel that multiplying by ten is a physical, understandable
movement: every digit shifts one place left, so 23 becomes 230 and 47 becomes
470. The viewer should reject “just add a zero” as the explanation and be able
to state the place-value rule.

## Output

- Framework: HyperFrames with editable sub-compositions.
- Canvas: 1920×1080.
- Frame rate: 30 fps.
- Runtime: 60.0 seconds, 1800 frames.
- Master: H.264 MP4 at 1920×1080 with AAC audio and embedded or adjacent WebVTT
  captions.
- Thumbnail frame: frame 0 must contain Ari's hand, the ×10 lever, the glowing
  digit 3, and visible workshop depth; never black.

## Story truth

- Worked example: `23 × 10 = 230`.
- Practice example: `47 × 10 = 470`.
- Correct explanation: multiplying a whole number by ten shifts every digit one
  place to the left in the place-value system; the empty ones place is recorded
  with zero.
- Misconception: the operation is not explained by attaching a decorative zero.
- All visible mathematics comes from one canonical data object and is rendered
  deterministically.

## Look

### Ground and palette

- Workshop ground: dark walnut `#2B1B16` with visible vertical grain at 3%
  contrast.
- Brass structure: `#B77A32`, highlights `#F2C879`, shadow `#5B341D`.
- Teal glass: `#123D43`, edge light `#62D6CF`.
- Number light: amber `#FFB534`; use only on active digits, lever marks, and the
  final rule.
- Paper/label ink: warm ivory `#F6E9CF` and near-black `#211914`.
- Accent ration: amber occupies no more than 12% of any frame.

### Typography

- Display and numerals: bundled sans, weight 750–800, 104–176 px depending on
  shot, tracking −2%.
- Dialogue captions: bundled sans, weight 650, 52 px, line height 1.15, maximum
  two lines and 10 words per caption group.
- Mechanical labels: bundled sans, weight 700, 34–42 px, tracking 8%.
- All captions and key text remain inside the 80% title-safe area.

### Material, light, and depth

- Medium: cinematic 3D-inspired painted animation with tactile walnut, brushed
  brass, frosted glass and enamel controls.
- Lens language: 35 mm for workshop geography, 50 mm for two-shots, 75 mm for
  reactions and mechanism inserts.
- Key light: warm upper-left at approximately 35 degrees.
- Fill: cool teal from the machine at 30% of key intensity.
- Rim: amber back-right on characters at 20% intensity.
- Contact shadows: 18 px vertical offset, 40 px blur, 42% opacity at full-size
  art reference; feet and props always make visible contact.
- Vignette: 6%, applied in final compositing rather than CSS on footage.
- Grain: 2%, deterministic.
- Depth: foreground pipes or tools cross frame edges in wide shots; the hero
  occupies at least 45% of frame height or width.

## Characters and objects

### Mira

- Adult teacher-inventor, warm brown skin, dark curly hair tied back, teal work
  coat with brass fasteners, amber scarf, practical boots.
- Performance: economical gestures, eye contact before explanation, encouraging
  half-smile after Ari's attempt.
- Movement offset: head leads torso by 3 frames; pointing hand follows shoulder
  by 2 frames; the non-gesturing arm remains quieter.

### Ari

- Child learner, medium brown skin, short textured hair, rust-orange sweater,
  navy trousers and cream trainers.
- Performance: leans toward mechanisms, eyebrows and head angle carry
  curiosity, full-body anticipation before pulling the lever.
- Reaction timing: misconception lands for 12 frames before Mira responds.

### Place Value Machine

- Three vertical glass chambers labelled HUNDREDS, TENS, ONES.
- Brass rails connect each chamber horizontally.
- A physical ×10 lever sits at Ari's waist height.
- Digit tokens are solid amber-lit enamel pieces, not floating type.
- An empty-place lamp sits in each chamber and illuminates zero only when the
  place is empty after the shift.
- Every control has a mount, hinge, track or socket; no floating controls.

## Motion

- Character anticipation: 8–12 frames; action: 10–18 frames; reaction hold:
  18–36 frames.
- Digit transport: 24-frame acceleration, 16-frame glide, 10-frame magnetic
  settle. Leftward motion uses `cubic-bezier(0.33, 0, 0.15, 1)`.
- Camera push: 36–54 frames with `cubic-bezier(0.45, 0, 0.2, 1)`.
- Camera exits: hard motivated cut or 12-frame foreground wipe; no generic
  dissolves.
- Character position springs: damping ratio 0.58 with no more than 6% overshoot.
- Opacity is used only for practical light changes and captions, never as the
  main entrance of a character, machine or title.
- Each shot has one hero move. Secondary motion travels 55–65% as far and
  begins 4–6 frames later.
- Captions use a 4-frame opacity onset without translation and disappear on the
  spoken boundary.
- No perpetual camera drift. Workshop background motion is limited to one slow
  pressure gauge, sparse dust in light, and practical lamp flicker below 2%
  luminance change.

## Sound

- Music: 92 BPM, 4/4, restrained marimba, pizzicato strings and warm bass; no
  triumphant trailer percussion.
- Dialogue target: approximately −16 LUFS integrated for the dialogue bus;
  final master approximately −14 LUFS integrated, true peak at or below −1 dBTP.
- Music sits 12–16 dB below dialogue and is spectrally carved during speech.
- Machine sounds: lever clunk, rail ratchet, glass chime, magnetic digit settle,
  low workshop hum, and a soft correct-answer resonance.
- Silence: music and hum dip for 3.2 seconds during the practice pause; retain a
  low physical room tone so the film does not feel muted.
- Sound motivates cuts: lever clunk starts the opener; digit settle starts the
  reveal of 230; Ari's second lever pull ends the thinking pause.

## Dialogue

Dialogue is canonical and may be performance-directed but not paraphrased.

1. **Mira:** “Inside this machine, every digit has a place.”
2. **Mira:** “Here is twenty-three: two tens and three ones.”
3. **Mira:** “Multiply by ten, and every digit moves one place left.”
4. **Ari:** “So we just stick a zero on the end?”
5. **Mira:** “The zero records the empty ones place. The movement is the rule.”
6. **Mira:** “Your turn. What is forty-seven times ten?”
7. **Ari:** “Four hundred and seventy.”
8. **Mira:** “Exactly. Every digit shifted one place left.”

## Shots

### Shot 1 — The lever already moving

- **Frames:** 0–149, 0.0–5.0 s.
- **Lens/framing:** 75 mm close insert, then 35 mm reveal.
- **Hero move:** Ari pulls the ×10 lever; the digit 3 launches left along a
  glass rail and carries the camera into the workshop.
- **Read:** “This machine moves numbers.” No instructional label beyond the
  deterministic ×10 mark.
- **Sound:** lever clunk on frame 4, rail ratchet from frames 12–60, music begins
  on frame 18.
- **Handoff:** the moving amber 3 crosses the lens and wipes into shot 2.

### Shot 2 — Give every digit a place

- **Frames:** 150–359, 5.0–12.0 s.
- **Lens/framing:** 35 mm wide two-shot with machine columns occupying the right
  58% of frame.
- **Hero move:** Mira guides Ari's attention from ONES to TENS to HUNDREDS with
  one continuous hand path.
- **Read window:** column labels from frame 180 onward; caption line 1 during
  Mira's dialogue.
- **Dialogue:** line 1.
- **Sound:** workshop hum, soft fingertip taps on each brass label.
- **Handoff:** Mira's fingertip lands beside the empty TENS chamber; the camera
  cuts on contact to the token tray.

### Shot 3 — Load twenty-three

- **Frames:** 360–599, 12.0–20.0 s.
- **Lens/framing:** 50 mm medium shot, Ari left and machine right.
- **Hero move:** Ari places solid 2 and 3 tokens into TENS and ONES; the
  deterministic equation `23` grows from the physical placements.
- **Read window:** `2 tens + 3 ones = 23` appears in three phrase-aligned steps,
  never all at once.
- **Dialogue:** line 2.
- **Sound:** enamel token contacts and two pitched glass responses.
- **Handoff:** Ari's hand stays on the lever as the camera pushes closer.

### Shot 4 — The shift

- **Frames:** 600–869, 20.0–29.0 s.
- **Lens/framing:** 50 mm machine close-up with character faces visible at the
  left edge for reaction.
- **Hero move:** the 2 and 3 tokens move left simultaneously on separate rails;
  the 2 reaches HUNDREDS, the 3 reaches TENS, and the ONES lamp resolves to 0.
- **Read window:** `23 × 10` from frame 620; `= 230` only after both tokens have
  settled, from frame 795.
- **Dialogue:** line 3.
- **Sound:** rising ratchet, two staggered magnetic settles, low correct-answer
  resonance.
- **Handoff:** final 0 lamp expands as a circular match cut to Ari's eye.

### Shot 5 — Turn over the misconception

- **Frames:** 870–1139, 29.0–38.0 s.
- **Lens/framing:** alternating 75 mm Ari and Mira reactions, preserving screen
  direction.
- **Hero move:** Ari mimes attaching a loose zero plate; Mira gently rotates it
  to reveal the engraved words EMPTY ONES PLACE, then points back to the rails.
- **Read window:** a small deterministic `not decoration` mark is visible only
  after Mira rotates the plate; the machine remains the explanation.
- **Dialogue:** lines 4 and 5.
- **Sound:** comic wooden click for the loose plate; music briefly suspends, then
  returns under Mira's correction.
- **Handoff:** Mira slides fresh 4 and 7 tokens toward Ari.

### Shot 6 — Your turn

- **Frames:** 1140–1439, 38.0–48.0 s.
- **Lens/framing:** 50 mm over Mira's shoulder toward Ari and the machine.
- **Hero move:** Ari loads 4 in TENS and 7 in ONES; the ×10 lever waits in the
  foreground while Ari and the viewer think.
- **Read window:** `47 × 10 = ?` from frame 1190 through frame 1439. No answer,
  answer-bearing title or transformed tokens appear.
- **Dialogue:** line 6, followed by a 3.2-second thinking pause.
- **Sound:** score and machine hum dip by 8 dB; one quiet clockwork tick per
  second; Ari breathes and looks between columns.
- **Handoff:** Ari grips the lever on the final pause frame.

### Shot 7 — Ari solves it

- **Frames:** 1440–1649, 48.0–55.0 s.
- **Lens/framing:** 35 mm three-quarter machine view with Ari foreground and
  Mira behind.
- **Hero move:** Ari pulls the lever; 4 and 7 shift left, and Ari turns to Mira
  only after the digits settle.
- **Read window:** `47 × 10 = 470` appears after the physical result, frame 1535
  onward.
- **Dialogue:** line 7.
- **Sound:** stronger lever clunk, rail movement, three-note correct-answer
  motif.
- **Handoff:** Mira's approving nod carries into the final camera pullback.

### Shot 8 — The rule remains

- **Frames:** 1650–1799, 55.0–60.0 s.
- **Lens/framing:** 35 mm slow pullback to the full workshop.
- **Hero move:** a brass rail-light traces one place left across the three
  columns while Mira and Ari watch the machine settle.
- **Read window:** `×10: every digit shifts one place left` from frame 1680 to
  1799. It is the only full-sentence instructional title.
- **Dialogue:** line 8.
- **Sound:** final line, warm chord, mechanical hum resolves but remains alive
  through the last frame.
- **End:** hold the complete machine, characters and rule for the final 60
  frames; no separate logo card.

## Banned

- Dark empty voids with small floating objects.
- Neon sci-fi holograms, generic particles, excessive glow or lens flares.
- Three cards in a row, bullet slides, icon circles or dashboard layouts.
- Text, equations or labels generated inside diffusion footage.
- Characters floating, sliding, fading into place, or moving both arms in
  perfect symmetry.
- Camera drift without story motivation.
- Repeated fade-and-slide entrances.
- Morphing faces, changing costume details, malformed hands, foot sliding, or
  props with no physical contact.
- Unmotivated whip pans, random speed ramps, generic glitch transitions or
  perpetual breathing applied to titles.
- A decorative zero presented as the mathematical cause.
- Full diagrams appearing at once before the corresponding phrase.
- Captions repeating a large on-screen sentence verbatim.
- Robotic default TTS delivery, wall-to-wall music, silent mechanical actions,
  or a master louder than −1 dBTP.

## QA

### Mandatory frames

- **Frame 0:** lever, Ari's hand, moving 3, and readable workshop depth; no
  black frame.
- **Frame 210:** Mira, Ari, and all three mounted columns read clearly; labels
  remain inside title-safe.
- **Frame 500:** 2 is physically in TENS, 3 is in ONES, and the deterministic
  decomposition agrees with the machine.
- **Frame 730:** both digits are visibly travelling left; no token changes
  identity or crosses the wrong rail.
- **Frame 825:** HUNDREDS=2, TENS=3, ONES=0 and the equation reads
  `23 × 10 = 230`.
- **Frame 1010:** the false zero plate is distinct from the real empty-place
  lamp; Mira's correction reads through action without captions.
- **Frame 1320:** practice question shows `47 × 10 = ?`; no answer is visible in
  titles, machine state, captions or background.
- **Frame 1580:** HUNDREDS=4, TENS=7, ONES=0 and the equation reads
  `47 × 10 = 470`.
- **Frame 1740:** final rule, both characters and full machine are visible and
  balanced; rule remains readable at 360 px playback width.

### Automated gates

- Exact duration: 60.0 s ± one frame.
- Video: 1920×1080, 30 fps, no black/frozen/corrupt frame sequences.
- Audio: dialogue present, integrated loudness approximately −14 LUFS, true
  peak ≤ −1 dBTP, no clipped or unintended silent dialogue.
- Captions: canonical dialogue order, no more than two lines, phrase-aligned.
- Mathematics: all equations and machine states derive from canonical values;
  practice answer remains absent before frame 1440.
- Continuity: same character face, hair, costume, body proportions, machine
  layout, screen direction and light direction across shots.
- Safety: no frightening imagery, dangerous machine behavior, illegible text or
  distracting flashing.

### Human gates

- Educator verifies the misconception correction and both calculations.
- Viewer can answer “What moved?” and `47 × 10` after one viewing.
- Normal-speed viewing does not expose obvious generative artifacts.
- The weakest shot can be replaced without changing narration, overlays, or
  the remaining shots.
