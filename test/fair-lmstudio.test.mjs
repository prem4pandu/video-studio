import test from 'node:test';
import assert from 'node:assert/strict';
import { fairLmStudioGenerate, fairLmStudioModels, fairLmStudioUrl } from '../src/fair-lmstudio.mjs';
import { normalizeBrief } from '../src/fair-plan.mjs';
import { fairServerConfig } from '../src/fair-server.mjs';

const jsonResponse = value => ({ ok: true, status: 200, json: async () => value, text: async () => JSON.stringify(value) });

test('LM Studio uses the local OpenAI-compatible structured-output contract', async () => {
  let request;
  const result = await fairLmStudioGenerate({
    prompt: 'Return four.', model: 'qwen3.8-27b-splash', name: 'probe',
    schema: { type: 'object', properties: { answer: { type: 'integer' } }, required: ['answer'], additionalProperties: false },
    fetchImpl: async (url, options) => {
      request = { url: String(url), options, body: JSON.parse(options.body) };
      return jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":4}' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } });
    },
  });

  assert.equal(request.url, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.body.model, 'qwen3.8-27b-splash');
  assert.equal(request.body.messages[0].content, 'Return four.\n/no_think');
  assert.equal(request.body.response_format.type, 'json_schema');
  assert.equal(request.body.response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(result.content), { answer: 4 });
});

test('LM Studio discovery is scoped, deduplicated, and rejects unsafe endpoints', async () => {
  let request;
  const models = await fairLmStudioModels({}, { fetchImpl: async (url, options) => {
    request = { url: String(url), options };
    return jsonResponse({ data: [{ id: 'qwen3.8-27b-splash' }, { id: 'qwen3.8-27b-splash' }, { id: 'text-embedding-local' }, { id: '' }, {}] });
  } });
  assert.deepEqual(models, ['qwen3.8-27b-splash']);
  assert.equal(request.url, 'http://127.0.0.1:1234/v1/models');
  assert.equal(request.options.redirect, 'error');
  for (const url of ['https://example.com/v1/', 'http://user:secret@127.0.0.1:1234/v1/', 'http://127.0.0.1:1234/v1/?key=secret']) {
    assert.throws(() => fairLmStudioUrl({ FAIR_LMSTUDIO_URL: url }), /loopback HTTP URL/);
  }
});

test('server prefers the available local LM Studio model while retaining Ollama', async () => {
  const config = await fairServerConfig({}, {
    fetchImpl: async url => String(url).includes('/api/tags')
      ? jsonResponse({ models: [{ name: 'gpt-oss:20b' }] })
      : jsonResponse({ data: [{ id: 'qwen3.8-27b-splash' }, { id: 'qwen/qwen3.8-27b' }] }),
    command: async () => ({ stdout: '', stderr: '' }),
    fileStat: async () => { throw new Error('Voice fixture intentionally absent.'); },
    openReadiness: async () => ({ available: false, blockers: ['Open renderer intentionally absent.'] }),
  });
  assert.equal(config.defaults.provider, 'lmstudio');
  assert.equal(config.defaults.model, 'qwen/qwen3.8-27b');
  assert.deepEqual(config.providers.find(provider => provider.id === 'lmstudio').models, ['qwen3.8-27b-splash', 'qwen/qwen3.8-27b']);
  assert.deepEqual(config.providers.find(provider => provider.id === 'local').models, ['gpt-oss:20b']);
  assert.equal(normalizeBrief({ text: 'Teach a complete primary science lesson.', provider: 'lmstudio' }).provider, 'lmstudio');
  assert.throws(() => normalizeBrief({ text: 'Teach a complete primary science lesson.', provider: 'lmstudio', generationVersion: 'open-source' }), /requires local planning/);
});

test('LM Studio failures are explicit and never return partial content', async () => {
  await assert.rejects(fairLmStudioGenerate({ prompt: 'x', model: 'fixture', name: 'probe', schema: { type: 'object' },
    fetchImpl: async () => ({ ok: false, status: 502, text: async () => '{"error":"bad output"}' }) }), /No fallback provider was used/);
  await assert.rejects(fairLmStudioGenerate({ prompt: 'x', model: 'fixture', name: 'probe', schema: { type: 'object' },
    fetchImpl: async () => jsonResponse({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) }), /truncated/);
});

test('LM Studio accepts Qwen non-thinking JSON returned in the reasoning channel', async () => {
  const result = await fairLmStudioGenerate({ prompt: 'x', model: 'qwen/qwen3.8-27b', name: 'probe', schema: { type: 'object' },
    fetchImpl: async () => jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: '{"answer":4}' } }] }) });
  assert.deepEqual(JSON.parse(result.content), { answer: 4 });
});
