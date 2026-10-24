# Cinematic benchmark

## Purpose

Prove one publishable five-second generated shot before expanding the educational film. The deterministic proof remains the timing and mathematics baseline only.

## Locked shot

Mira, a ten-year-old Indian inventor, stands in a monumental brass place-value workshop. She studies a polished lever, takes a small anticipatory breath, then pulls it with believable weight. The machine wakes: warm light travels through glass chambers while the camera makes a restrained slow dolly. Her face, costume, hand anatomy, lever contact, workshop geometry, and lighting remain stable.

No equation, numeral, label, or written word may be generated into the footage. Exact teaching content is composited later as deterministic graphics.

## Locked reference

`assets/reference/mira-brass-workshop-v1.png`

Identity anchors: warm brown skin; large dark eyes; short wavy black bob; brass hair clip; burnt-orange work jacket; cream shirt; teal utility trousers. Environment anchors: deep-teal workshop, aged brass machinery, warm practical lamps, glass chambers, layered depth.

## Motion prompt

Premium stylized 3D animated feature film. A clever ten-year-old Indian girl inventor in a burnt-orange work jacket and teal utility trousers stands inside a vast deep-teal and aged-brass mechanical workshop. She studies a polished brass lever, takes a subtle anticipatory breath, closes her anatomically correct right hand around the lever, and pulls it downward with believable weight. Warm amber energy wakes inside the glass machine chambers. Restrained slow camera dolly, motivated parallax, stable cinematic lighting, tactile metal, fabric and skin, nuanced facial performance, coherent mechanical geometry, family-film wonder. One continuous shot, five seconds, 16:9. No text, no numerals, no logo, no extra character, no extra fingers, no fused hand and prop, no face drift, no costume drift, no sliding feet, no random camera shake, no warping background, no excessive bloom.

## Candidates

1. Local Apple draft: FastVideo FastMetal 5B/14B T2V, used to measure the local ceiling. It cannot consume the reference image in the released MLX recipe, so identity consistency is expected to be weaker.
2. Final baseline: Wan 2.2 TI2V-5B on 24 GB NVIDIA, conditioned on the locked reference.
3. Escalation: Wan 2.2 I2V-A14B or Animate-14B on 80 GB NVIDIA when the 5B candidate fails identity, hands, contact, or motion.
4. Challenger: LTX 2.5 distilled on 32 GB+ NVIDIA for multishot and synchronized audio.
5. Speaking-shot challenger: Kandinsky 6 Lite/Pro with synchronized audio, only after the silent action shot passes.

## Release decision

The winner must pass every hard check in `qa-spec.json`, contain none of the immediate-reject defects, and receive a human verdict of “publishable animated short,” not “AI demo.” A failed candidate is preserved with its report; only the failed shot is regenerated.
