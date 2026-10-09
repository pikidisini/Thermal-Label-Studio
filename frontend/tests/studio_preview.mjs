import './setup_dom_mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
const require = createRequire(import.meta.url);
const { renderToPipeableStream } = require('../node_modules/react-dom/cjs/react-dom-server.node.development.js');
function render(element) {
  return new Promise((resolve, reject) => {
    let html = '';
    const writable = new Writable({ write(chunk, _encoding, next) { html += chunk.toString(); next(); } });
    writable.on('finish', () => resolve(html));
    const { pipe } = renderToPipeableStream(element, { onAllReady() { pipe(writable); }, onError: reject });
  });
}
import { useThermalSimulation } from '../src/features/simulation/hooks/useThermalSimulation.ts';
import { useSimulationStore } from '../src/store/useSimulationStore.ts';
import { useTemplateStore } from '../src/store/useTemplateStore.ts';
import { useStudioStore } from '../src/store/useStudioStore.ts';
import { useContractStore } from '../src/store/useContractStore.ts';
import { runEditorPreview } from '../src/features/simulation/api/editorPreviewApi.ts';
import App from '../src/App.tsx';
import { getPrintTarget, printEditorLabel, PrintFailure } from '../src/features/printing/api/printingApi.ts';
import { EditorPrintModal } from '../src/features/printing/ui/EditorPrintModal.tsx';
import { isNumericPrinterHost, targetFromFields, loadPrinterTarget, rememberPrinterTarget, PRINTER_TARGET_STORAGE_KEY } from '../src/features/printing/model/printerTarget.ts';
import { EditorSimulationModal } from '../src/features/simulation/ui/EditorSimulationModal.tsx';
import { Icon, LabelStudioLogo } from '../src/shared/ui/index.ts';
import { Printer } from 'lucide-react';

const bitmap = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const response = { request_id: 'preview-test', width_px: 640, height_px: 1600, dpi: 203.2, png_base64: bitmap };

test('shared icons expose token geometry and decorative or labelled semantics for both families', async () => {
  const material = await render(React.createElement(Icon, { glyph: 'print', size: 'small' }));
  assert.match(material, /data-ui-glyph="true"/);
  assert.match(material, /--ui-glyph-size:var\(--ui-icon-small\)/);
  assert.match(material, /aria-hidden="true"/);
  assert.doesNotMatch(material, /\sglyph=|\ssize=|aria-label=|role="img"/);
  const lucide = await render(React.createElement(Icon, { component: Printer, label: 'Printer status', size: 18 }));
  assert.match(lucide, /^<svg/);
  assert.match(lucide, /stroke="currentColor"/);
  assert.match(lucide, /--ui-glyph-size:var\(--ui-icon-18\)/);
  assert.match(lucide, /aria-label="Printer status"/);
  assert.match(lucide, /role="img"/);
  assert.match(lucide, /focusable="false"/);
  assert.doesNotMatch(lucide, /aria-hidden=|component=|\ssize=/);
  const logo = await render(React.createElement(Icon, { component: LabelStudioLogo }));
  assert.match(logo, /viewBox="0 0 24 24"/);
  assert.match(logo, /stroke="currentColor"/);
  assert.match(logo, /fill="currentColor"/);
  assert.doesNotMatch(logo, /#[0-9a-f]{3,6}/i);
});

test('Studio preview renders once through the current endpoint and clears stale images on failure', async () => {
  const originalSnapshot = React.useSyncExternalStore;
  const originalFetch = global.fetch;
  const originalTimer = global.setTimeout;
  const originalClear = global.clearTimeout;
  React.useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot();
  const callbacks = [];
  global.setTimeout = callback => { callbacks.push(callback); return callbacks.length; };
  global.clearTimeout = () => {};
  try {
    useTemplateStore.setState({ labelWidthMm: 80, labelHeightMm: 200 });
    useStudioStore.setState({ viewMode: 'preview' });
    useSimulationStore.setState({ previewImage: 'old', thermalImage: 'old', renderError: null });
    let trigger;
    const canvas = { getObjects: () => [], toSVG: () => '<svg xmlns="http://www.w3.org/2000/svg"><rect width="80" height="200"/></svg>' };
    function Harness() { trigger = useThermalSimulation({ current: canvas }).triggerRenderSimulation; return null; }
    await render(React.createElement(Harness));
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => response };
    };
    trigger(true);
    await callbacks.pop()();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/v1/simulation/editor-preview');
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.width_mm, 80);
    assert.equal(body.height_mm, 200);
    assert.equal(body.dpi, 203.2);
    assert.equal(body.encoder, "IPL");
    assert.match(body.svg, /<svg/);
    assert.ok(requests[0].options.signal instanceof AbortSignal);
    const state = useSimulationStore.getState();
    assert.equal(state.previewImage, `data:image/png;base64,${bitmap}`);
    assert.equal(state.thermalImage, state.previewImage);
    assert.equal(state.isRendering, false);
    // Ignore abort in the fake transport to prove generation checks also protect state.
    let resolveOld;
    let oldSignal;
    global.fetch = async (_url, options) => {
      oldSignal = options.signal;
      return new Promise(resolve => { resolveOld = resolve; });
    };
    trigger(true);
    const oldRun = callbacks.pop()();
    global.fetch = async () => ({ ok: true, json: async () => ({ ...response, png_base64: bitmap + 'new' }) });
    trigger(true);
    assert.equal(oldSignal.aborted, true);
    await callbacks.pop()();
    resolveOld({ ok: true, json: async () => response });
    await oldRun;
    assert.equal(useSimulationStore.getState().previewImage, `data:image/png;base64,${bitmap}new`);
    global.fetch = async () => ({ ok: false, status: 503 });
    trigger(true);
    await callbacks.pop()();
    assert.equal(useSimulationStore.getState().previewImage, null);
    assert.equal(useSimulationStore.getState().thermalImage, null);
    assert.match(useSimulationStore.getState().renderError, /server could not/);
    assert.equal(useSimulationStore.getState().isRendering, false);
    let resolveCrossing;
    global.fetch = async () => new Promise((resolve) => { resolveCrossing = resolve; });
    trigger(true);
    const crossingRun = callbacks.pop()();
    useContractStore.setState({ jsonData: { fields: { HISTORICAL: 'new' } }, outputBlocked: true });
    useSimulationStore.setState({ previewImage: null, thermalImage: null });
    resolveCrossing({ ok: true, json: async () => response });
    await crossingRun;
    assert.equal(useSimulationStore.getState().previewImage, null);
    useContractStore.getState().setOutputBlocked(false);
    const beforeBlocked = requests.length;
    useContractStore.getState().setOutputBlocked(true);
    global.fetch = async (url) => { requests.push({ url }); throw new Error('Blocked output made HTTP call'); };
    trigger(true);
    await callbacks.pop()();
    assert.equal(requests.length, beforeBlocked);
    assert.equal(useSimulationStore.getState().previewImage, null);
    assert.match(useSimulationStore.getState().renderError, /canonical working copy/);
    useContractStore.getState().setOutputBlocked(false);
  } finally {
    React.useSyncExternalStore = originalSnapshot;
    global.fetch = originalFetch;
    global.setTimeout = originalTimer;
    global.clearTimeout = originalClear;
    useStudioStore.setState({ viewMode: 'design' });
    useContractStore.getState().setOutputBlocked(false);
  }
});

test('preview client propagates cancellation and reports unsupported canvas', async () => {
  const original = global.fetch;
  const controller = new AbortController();
  try {
    global.fetch = async (_url, options) => {
      assert.equal(options.signal, controller.signal);
      return { ok: false, status: 422 };
    };
    await assert.rejects(runEditorPreview({ svg: '<svg/>', widthMm: 80, heightMm: 200, dpi: 203.2 }, controller.signal), /cannot be simulated/);
  } finally { global.fetch = original; }
});

test('local application renders Studio without a login or session controls', async () => {
  const html = await render(React.createElement(App));
  assert.match(html, /data-testid="app-root-container"/);
  assert.doesNotMatch(html, /data-testid="(login-page|btn-app-logout|app-auth-loading)"/);
});


test('simulation action offers the implemented IPL output language', async () => {
  const html = await render(React.createElement(EditorSimulationModal, {
    isOpen: true, onClose() {}, getSvg: () => '<svg/>', widthMm: 80, heightMm: 200, dpi: 203.2,
  }));
  assert.match(html, /<select[^>]+aria-label="Output language"/);
  assert.match(html, /<option value="IPL" selected="">IPL<\/option>/);
  assert.doesNotMatch(html, /<option value="ZPL"/);
});


test('print target inspection is a GET and a single explicit label POST sends layout, IPL and action target', async () => {
  const original = global.fetch; const requests = [];
  try {
    global.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      return { ok: true, json: async () => url.endsWith('/target')
        ? { available: true, host: '192.0.2.44', port: 9100, encoder: 'IPL' }
        : { request_id: 'print-test', status: 'SUBMITTED', confirmed: false, width_px: 160, height_px: 96, dpi: 203.2, payload_bytes: 800, copies: 3, target: { host: "192.0.2.99", port: 9200 } } };
    };
    const target = await getPrintTarget();
    assert.equal(target.host, '192.0.2.44');
    assert.equal(requests[0].options.method, undefined);
    const result = await printEditorLabel({ svg: '<svg/>', widthMm: 20, heightMm: 12, dpi: 203.2, encoder: 'IPL', target: { host: '192.0.2.99', port: 9200 }, copies: 3 });
    assert.equal(result.confirmed, false);
    assert.equal(result.copies, 3);
    assert.deepEqual(JSON.parse(requests[1].options.body), { svg: '<svg/>', width_mm: 20, height_mm: 12, dpi: 203.2, encoder: 'IPL', target: { host: '192.0.2.99', port: 9200 }, copies: 3 });
    assert.deepEqual(result.target, { host: '192.0.2.99', port: 9200 });
    assert.equal(requests[1].options.method, 'POST');
    assert.equal(requests[1].options.signal, undefined);
    assert.equal(requests.length, 2);
  } finally { global.fetch = original; }
});

test('print client treats unknown server failures and lost responses as uncertain without retry', async () => {
  const original = global.fetch;
  const request = { svg: '<svg/>', widthMm: 20, heightMm: 12, dpi: 203.2, encoder: 'IPL' };
  try {
    for (const [status, code, expected] of [[500, 'processing_failed', 'uncertain'], [500, 'print_preparation_failed', 'preparation'], [502, 'print_submission_uncertain', 'uncertain'], [503, 'printer_unavailable', 'unavailable'], [422, 'invalid_printer_target', 'target'], [422, 'invalid_print_copies', 'copies']]) {
      let calls = 0;
      global.fetch = async () => { calls++; return { ok: false, status, json: async () => ({ detail: { code } }) }; };
      await assert.rejects(printEditorLabel(request), error => error instanceof PrintFailure && error.kind === expected);
      assert.equal(calls, 1);
    }
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error('response lost'); };
    await assert.rejects(printEditorLabel(request), error => error.kind === 'uncertain');
    assert.equal(calls, 1);
  } finally { global.fetch = original; }
});

test('print dialog provides editable IP and port without requiring server configuration', async () => {
  const html = await render(React.createElement(EditorPrintModal, { isOpen: true, onClose() {}, getSvg: () => '<svg/>', widthMm: 20, heightMm: 12, dpi: 203.2 }));
  assert.match(html, /Loading optional server default/);
  assert.match(html.replace(/<!-- -->/g, ""), /20 × 12 mm/);
  assert.match(html, /aria-label="Printer IP address"/);
  assert.match(html, /aria-label="TCP port"[^>]*value="9100"/);
  assert.match(html, /aria-label="Copies"[^>]*value="1"/);
  assert.match(html, /<button[^>]*disabled[^>]*data-testid="btn-print-one-label"/);
  assert.match(html, /<option value="IPL" selected="">IPL<\/option>/);
  assert.match(html, /aria-label="Print format"/);
  assert.match(html, /aria-label="Communication method"/);
  for (const protocol of ['ZPL', 'Shared Printer', 'USB', 'SERIAL']) {
    assert.match(html.replace(/<!-- -->/g, ''), new RegExp(`<option value="${protocol}" disabled="">${protocol} — planned</option>`));
  }
  assert.match(html, /<button(?=[^>]*aria-label="Decrease copies")(?=[^>]*disabled)[^>]*>/);
  assert.match(html.replace(/<!-- -->/g, ''), /Print 1 label/);
});


test('printer target validation admits numeric IPv4/IPv6 and rejects names, URLs, scopes and invalid ports', () => {
  for (const host of ['192.0.2.44', '127.0.0.1', '::1', '2001:db8::1', '2001:0db8:0000:0000:0000:0000:0000:0001', '::ffff:192.0.2.44']) assert.equal(isNumericPrinterHost(host), true, host);
  for (const host of ['', 'printer.local', 'https://192.0.2.44', 'fe80::1%1', '0.0.0.0', '::', 'ff02::1', '224.0.0.1', '192.168.00.1', '1:::2', '1:2:3', '1:2:3:4:5:6:7:8:9', '[::1]', ' 192.0.2.44']) assert.equal(isNumericPrinterHost(host), false, host);
  for (const port of ['', '0', '65536', '9100foo', '1.5', '1e3', ' 9100', '-1']) assert.equal(targetFromFields('192.0.2.44', port), null, port);
  assert.deepEqual(targetFromFields('192.0.2.44', '9200'), { host: '192.0.2.44', port: 9200 });
});

test('printer target browser memory is bounded and tolerates invalid, unavailable and quota-limited storage', () => {
  const original = global.localStorage;
  let stored = null;
  try {
    global.localStorage = { getItem: () => stored, setItem: (key, value) => { assert.equal(key, PRINTER_TARGET_STORAGE_KEY); stored = value; } };
    assert.equal(loadPrinterTarget(), null);
    for (const value of ['not-json', '{}', '{"host":"printer.local","port":9100}', '{"host":"192.0.2.44","port":"9100"}', '{"host":"192.0.2.44","port":65536}']) { stored = value; assert.equal(loadPrinterTarget(), null); }
    rememberPrinterTarget({ host: '192.0.2.44', port: 9200 });
    assert.deepEqual(loadPrinterTarget(), { host: '192.0.2.44', port: 9200 });
    global.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    assert.equal(loadPrinterTarget(), null);
    assert.doesNotThrow(() => rememberPrinterTarget({ host: '192.0.2.44', port: 9200 }));
  } finally { global.localStorage = original; }
});


test('print client rejects missing or invalid response copies as uncertain', async () => {
  const original = global.fetch;
  try {
    for (const copies of [undefined, 0, 1000, true, 1.5, '3']) {
      global.fetch = async () => ({ ok: true, json: async () => ({ request_id: 'test', status: 'SUBMITTED', confirmed: false, width_px: 160, height_px: 96, dpi: 203.2, payload_bytes: 800, target: { host: '192.0.2.44', port: 9100 }, copies }) });
      await assert.rejects(printEditorLabel({ svg: '<svg/>', widthMm: 20, heightMm: 12, dpi: 203.2, encoder: 'IPL', copies: 3 }), error => error.kind === 'uncertain');
    }
  } finally { global.fetch = original; }
});


test('print client rejects invalid copy requests before fetch', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => assert.fail('Invalid copies contacted API');
    for (const copies of [0, 1000, true, 1.5, '3', null]) {
      await assert.rejects(printEditorLabel({ svg: '<svg/>', widthMm: 20, heightMm: 12, dpi: 203.2, encoder: 'IPL', copies }), error => error.kind === 'copies');
    }
  } finally { global.fetch = original; }
});
