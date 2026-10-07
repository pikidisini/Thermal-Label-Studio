import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import { parseFixtureResult, fixturePreviewUrl, runFixtureSimulation } from '../src/features/simulation/api/fixtureSimulationApi.ts';
import { FixtureReview, FixtureSimulationPage } from '../src/features/simulation/ui/FixtureSimulationPage.tsx';

const response = () => ({ request_id: "e43dd129-80ab-4777-bf02-623750b291ec", schema_version: 1, label_code: 'roll_80x200', layout_version: 'fixture-v1', items: [{
  item_index: 0, item_id: 'fixture-1', status: 'CAPTURED',
  trace: ['RECEIVED', 'RESOLVING_LAYOUT', 'BINDING_TEMPLATE', 'RASTERIZING', 'CAPTURED'].map((status) => ({ status, message: 'A bounded processing step.' })),
  preview: { media_type: 'image/png', width_px: 640, height_px: 1600, dpi: 203.2, png_base64: 'iVBORw0KGgo=' }, error: null,
}] });
const require = createRequire(import.meta.url);
const { renderToPipeableStream } = require('../node_modules/react-dom/cjs/react-dom-server.node.development.js');
const render = (element) => new Promise((resolve, reject) => {
  let markup = '';
  const writable = new Writable({ write(chunk, _encoding, done) { markup += chunk.toString(); done(); } });
  writable.on('finish', () => resolve(markup));
  const { pipe } = renderToPipeableStream(element, { onAllReady() { pipe(writable); }, onError: reject });
});
const html = (props) => render(React.createElement(FixtureReview, { loading: false, error: null, result: null, ...props }));

test('fixture review displays empty, loading, safe error, bitmap and failure evidence', async () => {
  assert.match(await html({}), /No fixture previews yet/);
  assert.match(await html({ loading: true }), /role="status"/);
  assert.match(await html({ error: 'Service unavailable' }), /role="alert"/);
  const result = parseFixtureResult(response());
  const success = await html({ result });
  assert.match(success, /src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(success.replace(/<!-- -->/g, ''), /Item 1 · fixture-1/);
  assert.match(success, /Processing steps/);
  assert.match(success, /e43dd129-80ab-4777-bf02-623750b291ec/);
  const failed = response();
  Object.assign(failed.items[0], { status: 'FAILED', preview: null, error: { code: 'invalid_template_or_facts', message: 'Required data is missing.' }, trace: [{ status: 'RECEIVED', message: 'Received.' }, { status: 'FAILED', message: 'Failed.' }] });
  const failure = await html({ result: parseFixtureResult(failed) });
  assert.match(failure, /Required data is missing/);
  assert.match(failure, /invalid_template_or_facts/);
  assert.doesNotMatch(failure, /<img/);
  assert.equal(fixturePreviewUrl(failed.items[0]), null);
});

test('fixture page is clearly a development fixture and has no auth gate', async () => {
  const markup = await render(React.createElement(FixtureSimulationPage));
  assert.match(markup, /Fixture simulation/);
  assert.match(markup, /Development fixture/);
  assert.match(markup, /Run fixture simulation/);
  assert.doesNotMatch(markup, /PPIC|pilot|SAP|Sign in/);
});

for (const [name, mutate] of [
  ['invalid request ID', (r) => { r.request_id = 'private/path'; }],
  ['extra raw fields', (r) => { r.facts = { password: 'secret' }; }],
  ['invalid index', (r) => { r.items[0].item_index = 1; }],
  ['invalid identity', (r) => { r.items[0].item_id = 'other'; }],
  ['wrong image scheme', (r) => { r.items[0].preview.png_base64 = 'https://remote.example/image'; }],
  ['SVG disguised as PNG', (r) => { r.items[0].preview.png_base64 = 'PHN2Zz4='; }],
  ['oversized bitmap', (r) => { r.items[0].preview.png_base64 = 'iVBORw0KGgo' + 'a'.repeat(87384); }],
  ['wrong DPI', (r) => { r.items[0].preview.dpi = 200; }],
  ['nonfinite DPI', (r) => { r.items[0].preview.dpi = Infinity; }],
  ['string DPI', (r) => { r.items[0].preview.dpi = '203.2'; }],
  ['wrong media dimensions', (r) => { r.items[0].preview.width_px = 1; }],
  ['captured with an error', (r) => { r.items[0].error = { code: 'processing_failed', message: 'Fail' }; }],
  ['missing trace', (r) => { r.items[0].trace = []; }],
  ['out of order trace', (r) => { r.items[0].trace[1].status = 'RASTERIZING'; }],
  ['oversized trace', (r) => { r.items[0].trace[1].message = 'x'.repeat(129); }],
  ['unknown status', (r) => { r.items[0].status = 'SUBMITTED'; }],
  ['empty response', (r) => { r.items = []; }],
  ['too many items', (r) => { r.items = Array(4).fill(r.items[0]); }],
]) test(`fixture response rejects ${name}`, () => { const r = response(); mutate(r); assert.throws(() => parseFixtureResult(r), /invalid/); });

test('fixture API posts only scenario to the new route and preserves backend bitmap', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, '/api/v1/simulation/fixture');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.body, '{"scenario":"sample"}');
    return new Response(JSON.stringify(response()), { headers: { 'Content-Type': 'application/json' } });
  };
  const result = await runFixtureSimulation('sample');
  assert.equal(calls, 1);
  assert.equal(result.items[0].preview.png_base64, response().items[0].preview.png_base64);
});

test('fixture API handles server errors, HTML, malformed/oversized JSON, empty results and network failure safely', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const bad of [
    () => new Response('private-password', { status: 500 }),
    () => new Response('<html>private</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('x'.repeat(300001), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(JSON.stringify({ ...response(), items: [] }), { headers: { 'Content-Type': 'application/json' } }),
    () => { throw new Error('private-path'); },
  ]) {
    globalThis.fetch = async () => bad();
    await assert.rejects(runFixtureSimulation('sample'), (error) => !/private/.test(error.message));
  }
  globalThis.fetch = async () => new Response(JSON.stringify(response()), { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(runFixtureSimulation('mixed'), /invalid/);
});

test('fixture API cancels on abort and rejects invalid scenarios before fetching', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.signal.aborted, true);
    throw new Error('aborted');
  };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runFixtureSimulation('sample', controller.signal), /interrupted/);
  globalThis.fetch = () => assert.fail('invalid scenario reached fetch');
  await assert.rejects(runFixtureSimulation('print'), /Choose a fixture/);
});


test('fixture errors retain only a validated server request ID', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const identity = response().request_id;
  globalThis.fetch = async () => new Response('private', { status: 500, headers: { 'x-request-id': identity } });
  await assert.rejects(runFixtureSimulation('sample'), (error) => error.message.includes(identity) && !error.message.includes('private'));
  globalThis.fetch = async () => new Response('private', { status: 500, headers: { 'x-request-id': 'private-path' } });
  await assert.rejects(runFixtureSimulation('sample'), (error) => !error.message.includes('private'));
});
