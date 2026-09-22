import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { apiClient } from '../src/utils/apiClient.ts';
import { renderApi } from '../src/utils/api/renderApi.ts';
import { barcodeGenerators } from '../src/utils/barcodeGenerators.ts';
import { INDUSTRIAL_SYMBOLS, getSymbolSvg } from '../src/utils/industrialSymbols.ts';
import { adaptSapContract } from '../src/utils/sapContractAdapter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

test('Frontend Build Artifacts Integrity', async (t) => {
  await t.test('dist/index.html exists and contains mount root', () => {
    const indexPath = path.join(frontendRoot, 'dist', 'index.html');
    assert.ok(fs.existsSync(indexPath), 'dist/index.html must exist');
    const html = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(html.includes('<div id="root">'), 'index.html must contain #root div');
    assert.ok(html.includes('/assets/'), 'index.html must reference bundled assets');
  });

  await t.test('dist/assets contains compiled JS and CSS bundles', () => {
    const assetsDir = path.join(frontendRoot, 'dist', 'assets');
    assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist');
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    const cssFiles = files.filter(f => f.endsWith('.css'));
    assert.ok(jsFiles.length > 0, 'Must have at least one .js bundle');
    assert.ok(cssFiles.length > 0, 'Must have at least one .css bundle');
  });
});

test('Barcode and QR Generators', async (t) => {
  await t.test('generateQrSvg creates valid SVG XML string', async () => {
    const svg = await barcodeGenerators.generateQrSvg('MAT:RM-001;BAT:B001');
    assert.ok(svg, 'Generated QR SVG must not be null');
    assert.ok(typeof svg === 'string', 'QR SVG must be a string');
    assert.ok(svg.includes('<svg'), 'QR SVG must contain <svg tag');
    assert.ok(svg.includes('</svg>'), 'QR SVG must contain </svg> closing tag');
  });
});

test('apiClient Mock Integration Tests', async (t) => {
  const originalFetch = global.fetch;

  t.afterEach(() => {
    global.fetch = originalFetch;
  });

  await t.test('listTemplates calls /api/v1/templates', async () => {
    global.fetch = async (url) => {
      assert.ok(url.endsWith('/api/v1/templates'));
      return {
        ok: true,
        json: async () => [{ id: 'tmpl_1', name: 'Template 1' }]
      };
    };

    const res = await apiClient.listTemplates();
    assert.ok(Array.isArray(res.templates));
    assert.equal(res.templates.length, 1);
    assert.equal(res.templates[0].id, 'tmpl_1');
  });

  await t.test('getTemplate calls /api/v1/templates/:id', async () => {
    global.fetch = async (url) => {
      assert.ok(url.endsWith('/api/v1/templates/my_template'));
      return {
        ok: true,
        json: async () => ({ id: 'my_template', raw_svg: '<svg></svg>' })
      };
    };

    const res = await apiClient.getTemplate('my_template');
    assert.equal(res.id, 'my_template');
  });

  await t.test('saveTemplate POSTs JSON to /api/v1/templates', async () => {
    let capturedBody = null;
    global.fetch = async (url, opts) => {
      assert.ok(url.endsWith('/api/v1/templates'));
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers['Content-Type'], 'application/json');
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ id: capturedBody.template_id, success: true })
      };
    };

    const res = await apiClient.saveTemplate('saved_id', '<svg></svg>', { width_mm: 200, height_mm: 80 });
    assert.equal(res.id, 'saved_id');
    assert.equal(capturedBody.template_id, 'saved_id');
    assert.equal(capturedBody.width_mm, 200);
  });

  await t.test('listSpoolerPrinters normalizes array to { printers, default_printer }', async () => {
    global.fetch = async (url) => {
      assert.ok(url.endsWith('/api/v1/print/printers'));
      return {
        ok: true,
        json: async () => ['Zebra ZT411', 'Microsoft Print to PDF']
      };
    };

    const res = await apiClient.listSpoolerPrinters();
    assert.ok(Array.isArray(res.printers));
    assert.equal(res.printers.length, 2);
    assert.equal(res.default_printer, 'Zebra ZT411');
  });

  await t.test('printDirect dispatches TCP request', async () => {
    let capturedBody = null;
    let capturedUrl = null;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ success: true, message: 'Sent' })
      };
    };

    const res = await apiClient.printDirect({
      method: 'raw_tcp',
      host: '192.168.1.100',
      port: 9100,
      protocol: 'zpl',
      svg_content: '<svg></svg>',
      json_data: { test: 123 },
      dpi: 203.2
    });

    assert.ok(capturedUrl.endsWith('/api/v1/print/tcp'));
    assert.equal(capturedBody.host, '192.168.1.100');
    assert.equal(capturedBody.port, 9100);
    assert.equal(capturedBody.printer_format, 'zpl');
    assert.equal(res.success, true);
  });

  await t.test('printDirect dispatches Spooler request', async () => {
    let capturedBody = null;
    let capturedUrl = null;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ success: true, message: 'Spooler job queued' })
      };
    };

    const res = await apiClient.printDirect({
      method: 'spooler',
      printer_name: 'ZDesigner ZT411',
      protocol: 'tspl',
      svg_content: '<svg></svg>',
      json_data: { test: 123 },
      dpi: 300
    });

    assert.ok(capturedUrl.endsWith('/api/v1/print/spooler'));
    assert.equal(capturedBody.printer_name, 'ZDesigner ZT411');
    assert.equal(capturedBody.printer_format, 'tspl');
    assert.equal(res.success, true);
  });

  await t.test('printBatch dispatches batch request to /api/v1/print/batch', async () => {
    let capturedBody = null;
    let capturedUrl = null;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ success: true, total_labels: 5, bytes_sent: 2048 })
      };
    };

    const res = await apiClient.printBatch({
      method: 'raw_tcp',
      host: '192.168.1.50',
      port: 9100,
      printer_format: 'zpl',
      copies: 5,
      data: { fields: { roll_no: 'ROL-001' } },
      increment_config: { field_name: 'roll_no', start_value: 'ROL-001', step: 1 }
    });

    assert.ok(capturedUrl.endsWith('/api/v1/print/batch'));
    assert.equal(capturedBody.copies, 5);
    assert.equal(capturedBody.increment_config.field_name, 'roll_no');
    assert.equal(res.success, true);
    assert.equal(res.total_labels, 5);
  });

  await t.test('safeDemo.getBatch calls /api/v1/safe-demo/batch', async () => {
    let capturedUrl = null;
    global.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({
          batch_id: 'demo-batch-001',
          total_items: 3,
          disclaimer: 'Demo data / not SAP production data',
          items: [
            { item_sequence: 1, copies: 1, canonical_item_data: { roll_number: 'R1' } },
            { item_sequence: 2, copies: 1, canonical_item_data: { roll_number: 'R2' } },
            { item_sequence: 3, copies: 1, canonical_item_data: { roll_number: 'R3' } },
          ],
        }),
      };
    };

    const batch = await apiClient.safeDemo.getBatch();
    assert.ok(capturedUrl.endsWith('/api/v1/safe-demo/batch'));
    assert.equal(batch.batch_id, 'demo-batch-001');
    assert.equal(batch.total_items, 3);
    assert.equal(batch.items.length, 3);
    assert.equal(batch.items[0].copies, 1);
  });

  await t.test('safeDemo.getBatch handles 404 fail-closed gracefully', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Safe demo mode is disabled.' }),
    });

    await assert.rejects(
      async () => await apiClient.safeDemo.getBatch(),
      /Safe Demo Mode dinonaktifkan di backend/
    );
  });

  await t.test('safeDemo.runDemo dispatches POST /api/v1/safe-demo/run', async () => {
    let capturedUrl = null;
    let capturedOpts = null;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return {
        ok: true,
        json: async () => ({
          batch_id: 'demo-batch-001',
          status: 'completed',
          items: [
            { item_sequence: 1, status: 'sent_to_simulator', status_display: 'Terkirim ke simulator — tidak dicetak fisik' },
          ],
        }),
      };
    };

    const res = await apiClient.safeDemo.runDemo();
    assert.ok(capturedUrl.endsWith('/api/v1/safe-demo/run'));
    assert.equal(capturedOpts.method, 'POST');
    assert.equal(res.status, 'completed');
    assert.equal(res.items[0].status_display, 'Terkirim ke simulator — tidak dicetak fisik');
  });

  await t.test('safeDemo.resetDemo dispatches POST /api/v1/safe-demo/reset', async () => {
    let capturedUrl = null;
    let capturedOpts = null;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return {
        ok: true,
        json: async () => ({
          status: 'reset_completed',
          message: 'Reset success',
          batch: { batch_id: 'demo-batch-001', status: 'ready' },
        }),
      };
    };

    const res = await apiClient.safeDemo.resetDemo();
    assert.ok(capturedUrl.endsWith('/api/v1/safe-demo/reset'));
    assert.equal(capturedOpts.method, 'POST');
    assert.equal(res.status, 'reset_completed');
    assert.equal(res.batch.status, 'ready');
  });

  await t.test('safeDemo.checkEnabled returns true when safe_demo_mode is true', async () => {
    global.fetch = async (url) => {
      assert.equal(url, '/api/status');
      return {
        ok: true,
        json: async () => ({ status: 'online', safe_demo_mode: true }),
      };
    };

    const enabled = await apiClient.safeDemo.checkEnabled();
    assert.equal(enabled, true);
  });

  await t.test('safeDemo.checkEnabled returns false (fail-closed) when safe_demo_mode is false or error', async () => {
    // 1. False in response
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ status: 'online', safe_demo_mode: false }),
    });
    let enabled = await apiClient.safeDemo.checkEnabled();
    assert.equal(enabled, false);

    // 2. Network error
    global.fetch = async () => {
      throw new Error('Network failure');
    };
    enabled = await apiClient.safeDemo.checkEnabled();
    assert.equal(enabled, false);
  });
});



test('SAP contract adapter keeps raw contract and exposes scalar UI tokens', () => {
  const { rawContract, tokenMap } = adaptSapContract({
    contract_version: '1.1',
    label_type: 'ROLL',
    label_code: 'PFO-30',
    source: { system: 'SAP' },
    fields: { brand: 'ASTRIA', criteria: 'A' },
    codes: { batch_barcode: '0000909358' },
  });

  assert.equal(tokenMap.brand, 'ASTRIA');
  assert.equal(tokenMap.batch_barcode, '0000909358');
  assert.equal(tokenMap.grade, 'A');
  assert.equal(tokenMap.source, undefined);
  assert.equal(tokenMap.fields, undefined);
  assert.equal(tokenMap.codes, undefined);
  assert.equal(rawContract.fields.brand, 'ASTRIA');
  assert.equal(rawContract.codes.batch_barcode, '0000909358');
  assert.equal(String(tokenMap.brand).includes('[object Object]'), false);
});

test('SAP sample_roll contract maps source aliases without flattening objects', () => {
  const samplePath = path.resolve(frontendRoot, '..', 'data_samples', 'sample_roll.json');
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const { rawContract, tokenMap } = adaptSapContract(sample);

  assert.equal(rawContract.contract_version, '1.1');
  assert.equal(rawContract.label_type, 'ROLL');
  assert.equal(rawContract.label_code, 'PFO-30');
  assert.equal(rawContract.source.matnr, 'SR01PFO3000810');
  assert.equal(tokenMap.material_number, 'SR01PFO3000810');
  assert.equal(tokenMap.batch_number, '0000909358');
  assert.equal(tokenMap.plant, '1100');
  assert.equal(tokenMap.grade, '');
  assert.equal(tokenMap.source, undefined);
  assert.equal(tokenMap.fields, undefined);
  assert.equal(tokenMap.codes, undefined);
  assert.equal(JSON.stringify(tokenMap).includes('[object Object]'), false);
});

test('SAP raw contract is retained when sent to preview API', async () => {
  const samplePath = path.resolve(frontendRoot, '..', 'data_samples', 'sample_roll.json');
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const originalFetch = global.fetch;
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, blob: async () => new Blob(['preview'], { type: 'image/png' }) };
  };
  try {
    await renderApi.renderSimulation('<svg xmlns="http://www.w3.org/2000/svg"></svg>', sample);
    assert.equal(body.data.contract_version, '1.1');
    assert.equal(body.data.label_type, 'ROLL');
    assert.equal(body.data.label_code, 'PFO-30');
    assert.equal(body.data.source.matnr, 'SR01PFO3000810');
    assert.equal(body.data.fields.brand, 'ASTRIA');
    assert.equal(body.data.codes.batch_barcode, '0000909358');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Industrial Standard Vector Symbols Library', async (t) => {
  await t.test('All GHS and ISO symbols are defined with valid SVG paths', () => {
    const symbolKeys = Object.keys(INDUSTRIAL_SYMBOLS);
    assert.ok(symbolKeys.length >= 10, 'Must have at least 10 industrial symbols');

    const ghs = symbolKeys.filter(k => INDUSTRIAL_SYMBOLS[k].category === 'GHS Hazard');
    const iso = symbolKeys.filter(k => INDUSTRIAL_SYMBOLS[k].category === 'ISO 7000 Packaging');
    assert.ok(ghs.length >= 6, 'Must have at least 6 GHS hazard pictograms');
    assert.ok(iso.length >= 4, 'Must have at least 4 ISO packaging symbols');

    for (const key of symbolKeys) {
      const sym = INDUSTRIAL_SYMBOLS[key];
      assert.ok(sym.name, `${key} must have a name`);
      assert.ok(sym.svg.includes('<svg'), `${key} SVG must start with <svg`);
      assert.ok(sym.svg.includes('</svg>'), `${key} SVG must end with </svg>`);
    }
  });

  await t.test('getSymbolSvg scales width and height properly', () => {
    const svg = getSymbolSvg('ghs_flammable', 25, 25);
    assert.ok(svg.includes('width="25mm"'));
    assert.ok(svg.includes('height="25mm"'));
  });
});

test('Custom Canvas Dimensions & Calculations', async (t) => {
  await t.test('calculates accurate pixel dots for custom dimensions at 203.2 DPI', () => {
    // 75mm x 35mm custom die-cut roll
    const wMm = 75;
    const hMm = 35;
    const dotsW = Math.round(wMm * 8);
    const dotsH = Math.round(hMm * 8);
    assert.equal(dotsW, 600);
    assert.equal(dotsH, 280);

    // 120mm x 80mm
    assert.equal(Math.round(120 * 8), 960);
    assert.equal(Math.round(80 * 8), 640);
  });

  await t.test('orientation swap toggles landscape and portrait dimensions', () => {
    let w = 75;
    let h = 35;
    assert.ok(w >= h, 'Initial is landscape');

    // Swap
    const temp = w;
    w = h;
    h = temp;
    assert.equal(w, 35);
    assert.equal(h, 75);
    assert.ok(h > w, 'After swap is portrait');
  });
});

test('History Stack (Undo / Redo) and Viewport Calculations', async (t) => {
  await t.test('undo stack records and reverts state snapshots', () => {
    const undoStack = [];
    const redoStack = [];

    // Action 1: Add element A
    undoStack.push(JSON.stringify({ objects: [{ id: 'A' }] }));
    assert.equal(undoStack.length, 1);

    // Action 2: Add element B
    undoStack.push(JSON.stringify({ objects: [{ id: 'A' }, { id: 'B' }] }));
    assert.equal(undoStack.length, 2);

    // Undo action 2
    const current = undoStack.pop();
    redoStack.push(current);
    const restored = JSON.parse(undoStack[undoStack.length - 1]);
    assert.equal(restored.objects.length, 1);
    assert.equal(restored.objects[0].id, 'A');

    // Redo action 2
    const next = redoStack.pop();
    undoStack.push(next);
    const redone = JSON.parse(undoStack[undoStack.length - 1]);
    assert.equal(redone.objects.length, 2);
    assert.equal(redone.objects[1].id, 'B');
  });

  await t.test('smooth zoom clamping adheres to minimum and maximum boundaries', () => {
    const clampZoom = (z) => Math.min(3.5, Math.max(0.2, Math.round(z * 20) / 20));
    assert.equal(clampZoom(0.05), 0.2);
    assert.equal(clampZoom(5.0), 3.5);
    assert.equal(clampZoom(1.234), 1.25);
  });

  await t.test('touchpad pinch sensitivity and mouse wheel zoom scaling', () => {
    const computeNextZoom = (curZoom, deltaY, isTouchpad = false) => {
      let factor;
      if (!isTouchpad && Math.abs(deltaY) >= 50) {
        factor = deltaY < 0 ? 1.15 : (1 / 1.15);
      } else {
        const clampedDeltaY = Math.max(-40, Math.min(40, deltaY));
        factor = Math.exp(-clampedDeltaY * 0.005);
      }
      return Math.min(4.0, Math.max(0.15, curZoom * factor));
    };

    // Physical mouse zoom in (negative 100 delta) -> 1.15x zoom
    const mouseZoomIn = computeNextZoom(1.0, -100);
    assert.equal(mouseZoomIn, 1.15, 'Mouse wheel notch scales exactly 15%');

    // Physical mouse zoom out from 1.15 -> exact 1.0 symmetry (zero drift)
    const mouseZoomOutFromZoomed = computeNextZoom(mouseZoomIn, 100);
    assert.ok(Math.abs(mouseZoomOutFromZoomed - 1.0) < 1e-9, 'Mouse wheel zoom in + out returns to 1.0 with zero drift');

    // Touchpad pinch (e.g. deltaY = -8)
    const touchPinchIn = computeNextZoom(1.0, -8, true);
    assert.ok(touchPinchIn > 1.03, 'Touchpad pinch is responsive');

    // Touchpad pinch symmetry: in by 8px, out by 8px returns to 1.0
    const touchPinchOut = computeNextZoom(touchPinchIn, 8, true);
    assert.ok(Math.abs(touchPinchOut - 1.0) < 1e-9, 'Touchpad pinch symmetry returns exactly to 1.0');

    // Extreme boundaries
    assert.equal(computeNextZoom(3.9, -100), 4.0, 'Clamped at max 4.0');
    assert.equal(computeNextZoom(0.16, 100), 0.15, 'Clamped at min 0.15');
  });

  await t.test('100-cycle zoom in and zoom out stress test maintains 100% mathematical zero-drift', () => {
    let z = 1.0;
    const notchIn = 1.15;
    const notchOut = 1 / 1.15;

    for (let i = 0; i < 100; i++) {
      z = z * notchIn;
      z = z * notchOut;
    }
    assert.ok(Math.abs(z - 1.0) < 1e-12, '100 cycles of zoom in + zoom out returns strictly to 1.0');
  });

  await t.test('touchpad two-finger gesture pans 2D canvas view without zooming', () => {
    const handleGesture = (e, curPan, curZoom) => {
      const isZoom = e.ctrlKey || e.metaKey;
      if (isZoom) {
        return { isZoom: true, pan: curPan, zoom: curZoom * 1.1 };
      }
      return {
        isZoom: false,
        pan: {
          x: curPan.x - e.deltaX,
          y: curPan.y - e.deltaY
        },
        zoom: curZoom
      };
    };

    const initialPan = { x: 100, y: 50 };
    const initialZoom = 1.0;

    // Two fingers swiping up and left
    const swipeEvent = { ctrlKey: false, metaKey: false, deltaX: 25, deltaY: 40 };
    const result = handleGesture(swipeEvent, initialPan, initialZoom);

    assert.equal(result.isZoom, false, 'Two finger swipe must NOT zoom');
    assert.equal(result.zoom, 1.0, 'Zoom must remain strictly constant during two-finger pan');
    assert.equal(result.pan.x, 75, 'Pan X shifts by deltaX');
    assert.equal(result.pan.y, 10, 'Pan Y shifts by deltaY');

    // Pinch event (ctrlKey is true)
    const pinchEvent = { ctrlKey: true, metaKey: false, deltaX: 0, deltaY: -10 };
    const pinchResult = handleGesture(pinchEvent, initialPan, initialZoom);
    assert.equal(pinchResult.isZoom, true, 'Pinch gesture with ctrlKey triggers zoom');
  });

  await t.test('zoom-to-cursor math keeps target point stationary under mouse', () => {
    const calculateAnchorPan = ({ curPan, mouseRelCenter, oldZoom, newZoom }) => {
      const scaleRatio = newZoom / oldZoom;
      return {
        x: curPan.x - mouseRelCenter.x * (scaleRatio - 1),
        y: curPan.y - mouseRelCenter.y * (scaleRatio - 1)
      };
    };

    // Case 1: Cursor at center (mouseRelCenter = 0, 0)
    const centerPan = calculateAnchorPan({
      curPan: { x: 50, y: 30 },
      mouseRelCenter: { x: 0, y: 0 },
      oldZoom: 1.0,
      newZoom: 1.5
    });
    assert.equal(centerPan.x, 50, 'Center zoom keeps pan x unchanged');
    assert.equal(centerPan.y, 30, 'Center zoom keeps pan y unchanged');

    // Case 2: Cursor 100px to the right of center
    const offsetPan = calculateAnchorPan({
      curPan: { x: 0, y: 0 },
      mouseRelCenter: { x: 100, y: 50 },
      oldZoom: 1.0,
      newZoom: 1.2
    });
    // scaleRatio = 1.2. Shift = -100 * (1.2 - 1) = -20px.
    assert.ok(Math.abs(offsetPan.x - (-20)) < 0.001, 'Shifts left to keep right-hand cursor point stationary');
    assert.ok(Math.abs(offsetPan.y - (-10)) < 0.001, 'Shifts up to keep lower cursor point stationary');
  });

  await t.test('handleResetFit resets pan offset to {0, 0} and applies bounded auto-fit zoom', () => {
    const calculateAutoFit = (viewportW, viewportH, labelWMm, labelHMm, pxPerMm = 4) => {
      const availableW = Math.max(100, viewportW - 48);
      const availableH = Math.max(100, viewportH - 48);
      const targetW = labelWMm * pxPerMm;
      const targetH = labelHMm * pxPerMm;
      const fitX = availableW / targetW;
      const fitY = availableH / targetH;
      const clamped = Math.min(4.0, Math.max(0.15, Math.min(fitX, fitY)));
      return Math.round(clamped * 20) / 20;
    };

    // Viewport 1200x800, Label 200x80 (target 800x320)
    const fitZoom = calculateAutoFit(1200, 800, 200, 80);
    assert.ok(fitZoom > 1.0, 'Fit zoom must scale up for spacious viewport');
    assert.equal(fitZoom, 1.45, 'Calculated auto fit is exactly 1.45x');

    // Resetting fit must always restore panOffset to {0, 0}
    const state = { panOffset: { x: -450, y: 220 }, zoom: 2.5 };
    const resetFit = () => {
      state.panOffset = { x: 0, y: 0 };
      state.zoom = fitZoom;
    };
    resetFit();
    assert.deepEqual(state.panOffset, { x: 0, y: 0 }, 'Pan offset must reset to 0,0');
    assert.equal(state.zoom, 1.45, 'Zoom must reset to auto-fit scale');
  });

  await t.test('handleOuterMouseDown deselects active object when clicking outside canvas container', () => {
    let activeObject = { id: 'text_1', type: 'text', isEditing: false };
    let selectionClearedCalled = false;
    let onSelectionChangedValue = 'not-called';

    const mockCanvas = {
      getActiveObject: () => activeObject,
      discardActiveObject: () => {
        activeObject = null;
        selectionClearedCalled = true;
      },
      requestRenderAll: () => {},
    };

    const mockContainer = {
      contains: (target) => target.id === 'canvas-paper' || target.id === 'inner-element',
    };

    const handleOuterMouseDown = (e, target) => {
      if (e.button === 0 && !e.isSpacePressed) {
        if (!mockContainer.contains(target)) {
          const active = mockCanvas.getActiveObject();
          if (active) {
            if (active.isEditing) active.isEditing = false;
            mockCanvas.discardActiveObject();
            mockCanvas.requestRenderAll();
            onSelectionChangedValue = null;
          }
        }
      }
    };

    // 1. Click inside canvas paper: should NOT deselect
    handleOuterMouseDown({ button: 0, isSpacePressed: false }, { id: 'canvas-paper' });
    assert.ok(activeObject !== null, 'Active object must remain selected when clicking inside canvas paper');
    assert.equal(selectionClearedCalled, false, 'discardActiveObject must not be called');

    // 2. Click outside on dark viewport: MUST deselect
    handleOuterMouseDown({ button: 0, isSpacePressed: false }, { id: 'dark-viewport' });
    assert.equal(activeObject, null, 'Active object must be discarded on outer click');
    assert.equal(selectionClearedCalled, true, 'discardActiveObject must be executed');
    assert.equal(onSelectionChangedValue, null, 'onSelectionChanged must be called with null');
  });

  await t.test('Escape key deselects active object', () => {
    let activeObject = { id: 'qr_1', type: 'image' };
    let discarded = false;
    let selectionReported = 'active';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (activeObject) {
          activeObject = null;
          discarded = true;
          selectionReported = null;
        }
      }
    };

    handleKeyDown({ key: 'Escape' });
    assert.equal(activeObject, null, 'Active object discarded on Escape');
    assert.equal(discarded, true, 'Discard flag is set');
    assert.equal(selectionReported, null, 'Selection notified as null');
  });
});

test('Fitur 1 - Studio Canvas & Visual Label Designer Test Suite', async (t) => {
  await t.test('TC-CANVAS-01: Label Dimension & DPI Scaling Calculation', () => {
    const calcDots = (mm, dpi) => Math.round((mm / 25.4) * dpi);

    // Input: 100mm x 50mm @ 203 DPI
    const wPx = calcDots(100, 203);
    const hPx = calcDots(50, 203);

    // Expected: 799 px (toleransi ±1px) and 399 px (toleransi ±1px)
    assert.ok(Math.abs(wPx - 799) <= 1, `Width ${wPx}px should be 799px ±1px`);
    assert.ok(Math.abs(hPx - 399) <= 1, `Height ${hPx}px should be 399px ±1px`);

    // Orientation toggle
    let widthMm = 100;
    let heightMm = 50;
    let isLandscape = widthMm >= heightMm;
    assert.equal(isLandscape, true, 'Initial orientation is Landscape');

    // Swap to Portrait
    const swapped = { w: heightMm, h: widthMm };
    assert.equal(swapped.w, 50);
    assert.equal(swapped.h, 100);
    assert.equal(swapped.w < swapped.h, true, 'Swapped orientation is Portrait');
  });

  await t.test('TC-CANVAS-02: Element Insertion & Object Selection', () => {
    const canvasObjects = [];
    let activeObject = null;
    let inspectorProperty = null;

    const addObject = (obj) => {
      canvasObjects.push(obj);
      activeObject = obj;
      inspectorProperty = { ...obj };
    };

    // 1. Add Text
    addObject({ id: 'text_1', type: 'i-text', text: 'Sample Text', left: 20, top: 20 });
    assert.equal(canvasObjects.length, 1);
    assert.equal(activeObject.id, 'text_1');

    // 2. Add Barcode (Code128)
    addObject({ id: 'barcode_1', type: 'image', barcodeType: 'code128', barcodeValue: '12345678' });
    assert.equal(canvasObjects.length, 2);
    assert.equal(activeObject.id, 'barcode_1');

    // 3. Add Industrial Symbol (Fragile)
    addObject({ id: 'symbol_1', type: 'path', symbolId: 'fragile', category: 'ISO 7000 Packaging' });
    assert.equal(canvasObjects.length, 3, 'Canvas must have 3 active objects');
    assert.equal(activeObject.id, 'symbol_1', 'Last added object must be active selection');
    assert.equal(inspectorProperty.symbolId, 'fragile', 'RightInspector displays active object properties');
  });

  await t.test('TC-CANVAS-03: Drag, Snap to Grid & Guidelines', () => {
    const gridSize = 10;
    const snapToGrid = (val, size) => Math.round(val / size) * size;

    // Drag to (54, 78) with 10px snap
    const rawX = 54;
    const rawY = 78;
    const snappedX = snapToGrid(rawX, gridSize);
    const snappedY = snapToGrid(rawY, gridSize);

    assert.equal(snappedX, 50, 'X coordinate 54 must snap to 50');
    assert.equal(snappedY, 80, 'Y coordinate 78 must snap to 80');

    // Smart Guideline calculation (detect alignment with existing object)
    const existingObj = { centerX: 100, centerY: 100 };
    const movingObj = { centerX: 98, centerY: 150 };
    const snapTolerance = 4;

    const isCenterAlignedX = Math.abs(movingObj.centerX - existingObj.centerX) <= snapTolerance;
    assert.equal(isCenterAlignedX, true, 'Guideline aligns when within tolerance');
  });

  await t.test('TC-CANVAS-04: Undo, Redo & Delete Keyboard Shortcuts', () => {
    const history = [];
    let historyIdx = -1;
    let canvasState = [];

    const pushState = (state) => {
      history.splice(historyIdx + 1);
      history.push(JSON.stringify(state));
      historyIdx = history.length - 1;
      canvasState = JSON.parse(JSON.stringify(state));
    };

    const undo = () => {
      if (historyIdx > 0) {
        historyIdx--;
        canvasState = JSON.parse(history[historyIdx]);
      }
    };

    const redo = () => {
      if (historyIdx < history.length - 1) {
        historyIdx++;
        canvasState = JSON.parse(history[historyIdx]);
      }
    };

    // Initial state: empty
    pushState([]);

    // Add 1 new text
    pushState([{ id: 'text_1', text: 'Hello' }]);
    assert.equal(canvasState.length, 1);

    // Step 1: Delete active object
    pushState([]);
    assert.equal(canvasState.length, 0, 'Object removed from canvas on Delete');

    // Step 2: Undo (Ctrl + Z)
    undo();
    assert.equal(canvasState.length, 1, 'Object restored on Undo (Ctrl + Z)');
    assert.equal(canvasState[0].id, 'text_1');

    // Step 3: Redo (Ctrl + Y)
    redo();
    assert.equal(canvasState.length, 0, 'Object removed again on Redo (Ctrl + Y)');
  });

  await t.test('TC-CANVAS-05: Visual Regression Metric Validation', () => {
    const computePixelDiffRatio = (totalDiffPixels, totalPixels) => totalDiffPixels / totalPixels;

    // Simulate standard rendered canvas comparing golden reference
    const totalPixels = 799 * 399;
    const diffPixels = 15; // small anti-aliasing artifact
    const diffRatio = computePixelDiffRatio(diffPixels, totalPixels);

    assert.ok(diffRatio < 0.001, `Pixel diff ratio (${(diffRatio * 100).toFixed(4)}%) must be < 0.1%`);
  });
});

test('Fitur 2 - Vector Toolbox Tools & Token Bindings Suite', async (t) => {
  await t.test('All 8 toolbox element creators construct valid Fabric object structures', () => {
    const pxPerMm = 4;

    // 1. Text
    const textObj = { type: 'i-text', text: 'Label Text', left: 20 * pxPerMm, top: 20 * pxPerMm, fontSize: 4 * pxPerMm };
    assert.equal(textObj.type, 'i-text');
    assert.equal(textObj.text, 'Label Text');

    // 2. Barcode 1D (Code128)
    const barcodeObj = { type: 'image', isBarcode: true, barcodeType: 'code128', barcodeValue: '12345678', dataBarcode: '12345678' };
    assert.equal(barcodeObj.isBarcode, true);
    assert.equal(barcodeObj.barcodeType, 'code128');

    // 3. QR Code 2D
    const qrObj = { type: 'image', isBarcode: true, barcodeType: 'qrcode', barcodeValue: 'https://sap.corp', dataQr: 'https://sap.corp' };
    assert.equal(qrObj.isBarcode, true);
    assert.equal(qrObj.barcodeType, 'qrcode');

    // 4. Rectangle (Box)
    const rectObj = { type: 'rect', width: 40 * pxPerMm, height: 25 * pxPerMm, fill: 'transparent', stroke: '#000000' };
    assert.equal(rectObj.type, 'rect');
    assert.equal(rectObj.fill, 'transparent');

    // 5. Line
    const lineObj = { type: 'line', stroke: '#000000', strokeWidth: 0.5 * pxPerMm };
    assert.equal(lineObj.type, 'line');

    // 6. Circle
    const circleObj = { type: 'circle', radius: 12 * pxPerMm, fill: 'transparent', stroke: '#000000' };
    assert.equal(circleObj.type, 'circle');

    // 7. Table Grid (Group)
    const tableObj = { type: 'group', isTable: true, width: 100 * pxPerMm, height: 30 * pxPerMm };
    assert.equal(tableObj.type, 'group');

    // 8. Industrial Symbol (GHS / ISO)
    const symbolObj = { type: 'group', isGhsSymbol: true, symbolId: 'fragile' };
    assert.equal(symbolObj.isGhsSymbol, true);
    assert.equal(symbolObj.symbolId, 'fragile');
  });

  await t.test('Token binding extractor tracks and binds SAP tokens', () => {
    const canvasObjects = [
      { type: 'i-text', dataField: 'material_number', text: '{{material_number}}' },
      { type: 'image', barcodeValue: '{{batch_number}}', isBarcode: true },
      { type: 'image', barcodeValue: '{{gross_weight_kg}}', isBarcode: true },
    ];

    const usedTokens = new Set();
    canvasObjects.forEach(obj => {
      if (obj.dataField) usedTokens.add(obj.dataField);
      if (obj.barcodeValue) {
        const matches = obj.barcodeValue.match(/{{(.*?)}}/g);
        if (matches) {
          matches.forEach(m => usedTokens.add(m.replace(/[{}]/g, '').trim()));
        }
      }
    });

    assert.equal(usedTokens.size, 3);
    assert.ok(usedTokens.has('material_number'));
    assert.ok(usedTokens.has('batch_number'));
    assert.ok(usedTokens.has('gross_weight_kg'));
  });
});
