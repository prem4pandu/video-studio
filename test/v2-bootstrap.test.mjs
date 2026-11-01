import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../app/web/flutter_bootstrap.js', import.meta.url), 'utf8'))
  .replace('{{flutter_js}}', '').replace('{{flutter_build_config}}', '');
function bootstrap(load) {
  const status = { hidden: false, textContent: 'Loading Video Studio…', setAttribute(name, value) { this[name] = value; } };
  const context = { URL, document: { baseURI: 'http://localhost:4310/app/', getElementById: () => status }, console: { error() {} }, _flutter: { loader: { load } } };
  vm.runInNewContext(source, context);
  return status;
}
test('Flutter bootstrap selects same-origin renderer and hides startup only after app runs', async () => {
  let options;
  const status = bootstrap(value => { options = value; return Promise.resolve(); });
  assert.equal(options.config.canvasKitBaseUrl, 'http://localhost:4310/app/canvaskit/');
  let ran = false;
  await options.onEntrypointLoaded({ initializeEngine: async () => ({ runApp: async () => { assert.equal(status.hidden, false); ran = true; } }) });
  assert.equal(ran, true); assert.equal(status.hidden, true);
});
test('Flutter bootstrap surfaces engine and entrypoint failures instead of an empty page', async () => {
  let options;
  const status = bootstrap(value => { options = value; return Promise.resolve(); });
  await options.onEntrypointLoaded({ initializeEngine: async () => { throw new Error('WASM fixture failure'); } });
  assert.equal(status.hidden, false); assert.equal(status.role, 'alert'); assert.match(status.textContent, /could not start/);
  const failedLoad = bootstrap(() => Promise.reject(new Error('Entrypoint fixture failure')));
  await Promise.resolve();
  assert.equal(failedLoad.hidden, false); assert.equal(failedLoad.role, 'alert');
});
