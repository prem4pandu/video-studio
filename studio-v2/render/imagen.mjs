import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { fairCommand } from '../../src/utils.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const genbg = join(repo, 'studio-v2/render/genbg.py');
export function imagenPaths(env = process.env) {
  return {
    python: env.STUDIO_V2_IMAGEN_PYTHON || join(repo, '.fair-neural/comfy-venv/bin/python'),
    model: env.STUDIO_V2_IMAGEN_MODEL || 'stabilityai/sdxl-turbo',
    steps: env.STUDIO_V2_IMAGEN_STEPS || '4',
  };
}
export function imagenReadiness(env = process.env) {
  const { python } = imagenPaths(env);
  try {
    if (!statSync(python).isFile() || !statSync(genbg).isFile()) throw 0;
    return { available: true, detail: `Local image generation (diffusers/MPS) at ${python}` };
  } catch {
    return { available: false, detail: 'Local image generation environment not installed' };
  }
}

// Scene → art prompt: deterministic illustration brief from scene content.
export function scenePrompt(scene) {
  const topic = `${scene.title} ${scene.narration}`;
  const style = "children's educational animation background, flat illustrated 2D storybook style, vibrant cheerful colors, soft shapes, generous negative space for overlay text, no text, no letters, no words, no characters, no watermark";
  if (/water|ocean|rain|river|sea\b/i.test(topic)) return `sunny coastal landscape: bright blue sky, golden sun with rays, white puffy clouds, layered teal mountains with snow caps, green rolling hills, calm turquoise ocean with gentle waves, a small river winding to the sea, ${style}`;
  if (/space|planet|moon|star|solar|earth|orbit/i.test(topic)) return `warm space scene: deep indigo sky with soft stars, a glowing sun, stylized planets, a friendly crescent moon, gentle nebula gradients, ${style}`;
  if (/bee|flower|garden|pollen|insect|bloom|plant/i.test(topic)) return `sunny garden meadow: bright blue sky, golden sun, white clouds, green rolling meadow, large colorful illustrated flowers, soft butterflies and bees in the distance, ${style}`;
  if (/fraction|math|number|count|add|shape/i.test(topic)) return `cozy illustrated classroom scene: warm cream walls, wooden desk surface at the bottom, a friendly chalkboard, soft sunlight through a window, potted plants, ${style}`;
  if (/forest|tree|leaf|animal|nature|wood/i.test(topic)) return `lush green forest clearing: tall stylized trees, dappled sunlight through leaves, mossy ground, soft ferns and mushrooms, gentle stream, ${style}`;
  return `bright open landscape: soft gradient sky, gentle rolling hills in layered teal and green, a warm sun, drifting clouds, open meadow foreground, ${style}`;
}

// Generate one backdrop image for a scene; returns the file path.
export async function generateBackdrop(scene, outPath, { env = process.env, signal } = {}) {
  const { python, model, steps } = imagenPaths(env);
  await mkdir(dirname(outPath), { recursive: true });
  await fairCommand(python, [genbg, scenePrompt(scene), outPath, '1344', '768', model, steps], { env, signal, timeoutMs: 600000 });
  return outPath;
}
