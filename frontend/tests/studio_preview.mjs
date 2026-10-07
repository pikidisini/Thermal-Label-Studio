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
import { runEditorPreview } from '../src/features/simulation/api/editorPreviewApi.ts';
import App from '../src/App.tsx';

const bitmap = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const response = { request_id: 'preview-test', width_px: 640, height_px: 1600, dpi: 203.2, png_base64: bitmap };

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
  } finally {
    React.useSyncExternalStore = originalSnapshot;
    global.fetch = originalFetch;
    global.setTimeout = originalTimer;
    global.clearTimeout = originalClear;
    useStudioStore.setState({ viewMode: 'design' });
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
