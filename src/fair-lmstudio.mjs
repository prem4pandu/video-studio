const DEFAULT_URL = 'http://127.0.0.1:1234/v1/';

export function fairLmStudioUrl(env = {}, path = '') {
  const base = new URL(env.FAIR_LMSTUDIO_URL || DEFAULT_URL);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash) {
    throw new Error('FAIR_LMSTUDIO_URL must be a loopback HTTP URL without credentials, query, or fragment.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(path, base);
}

const headers = env => ({ 'content-type': 'application/json', ...(env.FAIR_LMSTUDIO_API_KEY ? { authorization: `Bearer ${env.FAIR_LMSTUDIO_API_KEY}` } : {}) });

export async function fairLmStudioModels(env = {}, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(fairLmStudioUrl(env, 'models'), {
    redirect: 'error', headers: headers(env), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2500)]) : AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`LM Studio returned HTTP ${response.status} while listing models.`);
  const result = await response.json();
  return [...new Set((result.data || []).map(model => model?.id).filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()).filter(value => !/(?:^|[-_/])embed(?:ding)?(?:[-_/]|$)/i.test(value)))];
}

export async function fairLmStudioGenerate({ prompt, model, schema, name, env = {}, signal, timeoutMs = 180000, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(fairLmStudioUrl(env, 'chat/completions'), {
      redirect: 'error', method: 'POST', headers: headers(env),
      // Qwen reasoning presets otherwise spend the completion budget before emitting the schema result.
      body: JSON.stringify({ model, messages: [{ role: 'user', content: `${prompt}\n/no_think` }], temperature: 0.35, max_tokens: 16000, stream: false,
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw new Error(`LM Studio request failed for ${model}. Keep the local server running and check FAIR_LMSTUDIO_URL. ${error.message}`);
  }
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('LM Studio returned an oversized response.');
  if (!response.ok) throw new Error(`LM Studio returned HTTP ${response.status} for ${model}. No fallback provider was used.`);
  let envelope;
  try { envelope = JSON.parse(body); } catch { throw new Error('LM Studio returned invalid JSON.'); }
  if (!Array.isArray(envelope.choices) || envelope.choices.length !== 1) throw new Error('LM Studio returned an ambiguous completion.');
  const choice = envelope.choices[0];
  if (choice.finish_reason === 'length') throw new Error('LM Studio output was truncated; use a shorter brief or increase the model context.');
  if (choice.finish_reason !== 'stop') throw new Error(`LM Studio completion ended with ${choice.finish_reason || 'an unknown status'}.`);
  const content = typeof choice.message?.content === 'string' && choice.message.content.trim()
    ? choice.message.content : choice.message?.reasoning_content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('LM Studio returned no generated lesson text.');
  return { content, envelope, body };
}
