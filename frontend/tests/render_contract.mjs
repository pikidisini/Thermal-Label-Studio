import test from 'node:test';
import assert from 'node:assert/strict';
import { renderApi } from '../src/utils/api/renderApi.ts';

const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const data = { fields: { material_number: 'MAT-001' }, codes: {} };

function mockResponse({ ok = true, body = {}, blob = new Blob(['png'], { type: 'image/png' }) } = {}) {
  return {
    ok,
    json: async () => body,
    blob: async () => blob,
  };
}

test('renderApi preview sends backend contract and returns Blob', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return mockResponse();
  };

  try {
    const result = await renderApi.renderSimulation(svg, data, {
      dpi: 300,
      threshold: 127,
      widthMm: 50,
      heightMm: 25,
    });

    assert.equal(request.url, '/api/v1/render/preview');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.body.template_svg, svg);
    assert.equal(request.body.preview_type, 'png');
    assert.equal(request.body.binarization_threshold, 127);
    assert.equal(request.body.width_mm, 50);
    assert.equal(request.body.height_mm, 25);
    assert.ok(result instanceof Blob);
  } finally {
    global.fetch = originalFetch;
  }
});

test('renderApi monochrome preview uses the same binary endpoint', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return mockResponse();
  };

  try {
    const result = await renderApi.renderPreviewBlob(svg, data, { widthMm: 50, heightMm: 25 });
    assert.equal(request.url, '/api/v1/render/preview');
    assert.equal(request.body.preview_type, 'monochrome_1bit');
    assert.ok(result instanceof Blob);
  } finally {
    global.fetch = originalFetch;
  }
});

test('renderApi export sends one selected format and custom dimensions', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return mockResponse({ body: { success: true, job_id: 'job-1', files: { zpl: '/download.zpl' } } });
  };

  try {
    const result = await renderApi.exportRenderJob(svg, data, 'zpl', { widthMm: 50, heightMm: 25 });
    assert.equal(request.url, '/api/v1/render');
    assert.deepEqual(request.body.formats, ['zpl']);
    assert.equal(request.body.template_svg, svg);
    assert.equal(request.body.width_mm, 50);
    assert.equal(request.body.height_mm, 25);
    assert.equal(result.job_id, 'job-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('renderApi inspect sends JSON body and propagates non-2xx errors', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return mockResponse({ ok: false, body: { detail: 'Backend unavailable' } });
  };

  try {
    await assert.rejects(
      () => renderApi.inspectSvgTokens(svg),
      /Backend unavailable/,
    );
    assert.equal(calls[0].url, '/api/v1/templates/parse-raw');
    assert.deepEqual(calls[0].body, { svg_content: svg });
  } finally {
    global.fetch = originalFetch;
  }
});
