import assert from 'node:assert/strict';
import test from 'node:test';
import { fairComparisonWorkflow, fairH3Workflow, fairLtxWorkflow } from '../src/local-video-models.mjs';

test('H3 comparison uses the Apple-compatible FP16 VAE and turbo sampler', () => {
  const graph = fairH3Workflow('same prompt');
  assert.equal(graph['1'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors');
  assert.equal(graph['10'].inputs.steps, 8);
  assert.equal(graph['6'].inputs.prompt, 'same prompt');
});

test('LTX comparison is one-stage and needs no missing latent upscaler', () => {
  const graph = fairLtxWorkflow('same prompt');
  assert.equal(graph['3'].inputs.vae_name, 'ltx-2.5-video-vae-conv-bf16.safetensors');
  assert.equal(Object.values(graph).some(item => item.class_type === 'LTXVLatentUpsampler'), false);
  assert.equal(graph['14'].inputs.sigmas, '0.85, 0.725, 0.4219, 0.0');
  assert.equal(graph['5'].inputs.text, 'same prompt');
});

test('all comparison workflows are fixed local graphs with one output node', () => {
  for (const model of ['h3', 'ltx', 'wan']) {
    const result = fairComparisonWorkflow(model, 'same prompt');
    assert.ok(result.graph[result.outputNode]);
    assert.equal(result.graph[result.outputNode].class_type, 'SaveVideo');
    assert.ok(result.files.every(file => file.endsWith('.safetensors')));
  }
  assert.equal(fairComparisonWorkflow('wan', 'same prompt').graph['8'].inputs.seed, 424242);
});
