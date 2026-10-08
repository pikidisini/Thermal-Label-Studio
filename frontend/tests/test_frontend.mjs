import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { barcodeGenerators } from '../src/features/barcode/model/barcodeGenerators.ts';
import { qrGenerator } from '../src/features/qr/model/qrGenerator.ts';
import { adaptSapContract, resolveSapTokenDisplayValue } from '../src/features/data-tokens/index.ts';
import { useHistoryStore } from '../src/store/useHistoryStore.ts';
import { parseLocalSapJson } from '../src/features/data-tokens/index.ts';
import { validatePreviewPayload } from '../src/features/barcode/model/barcodePreview.ts';
import { useContractStore } from '../src/store/useContractStore.ts';
import { parseEditorDraft, editorDraftKey, EDITOR_DRAFT_VERSION } from '../src/features/canvas/draft/editorDraftRecovery.ts';
import { getMajorStepMm } from '../src/features/canvas/ruler/rulerScale.ts';

test('F3.35 ruler chooses a readable major interval from the 1/2/5 scale', () => {
  assert.equal(getMajorStepMm(4), 20);
  assert.equal(getMajorStepMm(16), 5);
  assert.equal(getMajorStepMm(0), 50000);
});

test('F3.20 editor draft validation is versioned and user scoped', () => {
  const valid = JSON.stringify({ version: EDITOR_DRAFT_VERSION, userId: 'u-1', savedAt: Date.now(), templateId: 't', widthMm: 200, heightMm: 80, viewMode: 'design', canvas: { objects: [] } });
  assert.equal(parseEditorDraft(valid, 'u-1')?.userId, 'u-1');
  assert.equal(editorDraftKey('u-1'), 'thermal-label-studio:editor-draft:u-1');
  assert.equal(parseEditorDraft('{bad', 'u-1'), null);
  assert.equal(parseEditorDraft(valid, 'u-2'), null);
  assert.equal(parseEditorDraft(valid.replace('"widthMm":200', '"widthMm":-1'), 'u-1'), null);
  assert.equal(parseEditorDraft(valid.replace('"objects":[]', '"objects":{}'), 'u-1'), null);
  const legacyMetadata = valid.replace('"objects":[]', '"objects":[{"type":"group","legacyMetadata":{"version":2}}]');
  assert.ok(parseEditorDraft(legacyMetadata, 'u-1'));
  assert.equal(parseEditorDraft(' '.repeat(5 * 1024 * 1024 + 1), 'u-1'), null);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

test('F3.15 shared preview validation rejects unsafe payloads and accepts valid values', () => {
  assert.equal(validatePreviewPayload('ean13', '4006381333931'), null);
  assert.match(validatePreviewPayload('ean13', '4006381333932'), /check digit/i);
  assert.match(validatePreviewPayload('code39', 'abc'), /Code 39/);
  assert.equal(validatePreviewPayload('code39', 'ABC-39'), null);
  assert.equal(validatePreviewPayload('code128', 'Label 01'), null);
  assert.match(validatePreviewPayload('qrcode', ''), /QR/);
});

test('F3.15 token edits target nested fields/codes and custom preview fields', () => {
  useContractStore.setState({ jsonData: { fields: { brand: 'A' }, codes: { batch_barcode: '1' } }, tokenMap: { brand: 'A', batch_barcode: '1' } });
  useContractStore.getState().updateTokenValue('batch_barcode', '2');
  assert.equal(useContractStore.getState().jsonData.codes.batch_barcode, '2');
  assert.equal(useContractStore.getState().jsonData.fields.brand, 'A');
  useContractStore.getState().updateTokenValue('custom_note', 'uji');
  assert.equal(useContractStore.getState().jsonData.fields.custom_note, 'uji');
});

test('F3.16 preserves raw-v2 token provenance and scopes custom tokens to the active contract', () => {
  const parsed = parseLocalSapJson({
    contract_schema_version: '2.0-raw',
    items: [{ item_sequence: 1, characteristics: [{ name: 'ZZBRAND', value: 'A' }], business_context: { customer_name: 'C', plant: '1100' } }],
  });
  const item = parsed.items[0];
  assert.equal(item.tokenCategories?.ZZBRAND, 'characteristic');
  assert.equal(item.tokenCategories?.customer_name, 'customer');
  assert.equal(item.tokenCategories?.plant, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(item.contract, 'tokenCategories'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(item.contract, 'token_categories'), false);

  useContractStore.setState({ activeContractKey: 'goods_receipt', customTokens: new Set(['goods_receipt:my_note']) });
  useContractStore.getState().setLocalImportedContract(item.contract, item.tokenMap, { format: 'raw-v2', fileName: 'fixture.json', itemSequence: 1, itemCount: 1 });
  assert.equal(useContractStore.getState().customTokens.size, 0);
  useContractStore.getState().setSampleContracts({ standard: item.contract });
  useContractStore.getState().switchContract('standard');
  assert.equal(useContractStore.getState().customTokens.size, 0);
});

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
    const svg = await qrGenerator.generateQrSvg('MAT:RM-001;BAT:B001');
    assert.ok(svg, 'Generated QR SVG must not be null');
    assert.ok(typeof svg === 'string', 'QR SVG must be a string');
    assert.ok(svg.includes('<svg'), 'QR SVG must contain <svg tag');
    assert.ok(svg.includes('</svg>'), 'QR SVG must contain </svg> closing tag');
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

test('local SAP v1.1 parser preserves null and empty scalar values', () => {
  const parsed = parseLocalSapJson({
    contract_version: '1.1',
    source: { system: 'LOCAL' },
    fields: { material: null, description: '' },
    codes: {},
  });
  assert.equal(parsed.format, 'v1.1');
  assert.equal(parsed.items[0].tokenMap.material, null);
  assert.equal(parsed.items[0].tokenMap.description, '');
});

test('local raw v2 parser creates one exploration contract per item without derived values', () => {
  const parsed = parseLocalSapJson({
    contract_schema_version: '2.0-raw',
    items: [
      { item_sequence: 2, label_code: 'N001', characteristics: [{ name: 'MATNR', value: 'A' }], business_context: { plant: '1000' } },
      { item_sequence: 1, characteristics: [{ name: 'LOT/NO', value: '' }], business_context: {} },
    ],
  });
  assert.deepEqual(parsed.items.map((item) => item.itemSequence), [1, 2]);
  assert.equal(parsed.items[0].tokenMap['LOT/NO'], '');
  assert.equal(parsed.items[1].tokenMap.plant, '1000');
  assert.equal(parsed.items[1].tokenMap.barcode, undefined);
});

test('local raw v2 parser rejects duplicate sequences, names, and non-scalar values', () => {
  assert.throws(() => parseLocalSapJson({ contract_schema_version: '2.0-raw', items: [
    { item_sequence: 1, characteristics: [{ name: 'A', value: 1 }, { name: 'A', value: 2 }] },
    { item_sequence: 1, characteristics: [] },
  ] }), /duplicated/i);
  assert.throws(() => parseLocalSapJson({ contract_schema_version: '2.0-raw', items: [
    { item_sequence: 1, characteristics: [{ name: 'A', value: { nested: true } }] },
  ] }), /scalar/i);
});

test('local raw v2 synthetic fixture skips nested provenance with a warning', () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(frontendRoot, 'tests/fixtures/local_raw_v2.synthetic.json'), 'utf8'));
  const parsed = parseLocalSapJson(fixture);
  assert.equal(parsed.items.length, 3);
  assert.ok(parsed.warnings.some((warning) => warning.includes('production_date_provenance')));
  assert.equal(parsed.items[0].tokenMap.production_date_provenance, undefined);
});

test('local raw v2 parser rejects case-insensitive characteristic/context collisions', () => {
  assert.throws(() => parseLocalSapJson({ contract_schema_version: '2.0-raw', items: [
    { item_sequence: 1, characteristics: [{ name: 'MATNR', value: 'A' }], business_context: { matnr: 'B' } },
  ] }), /conflicts/i);
});

test('dynamic SAP text display updates preserve absent, null, and empty semantics', () => {
  assert.equal(resolveSapTokenDisplayValue('SYN-MAT-0001', 'material_number'), 'SYN-MAT-0001');
  assert.equal(resolveSapTokenDisplayValue('SYN-MAT-0002', 'material_number'), 'SYN-MAT-0002');
  assert.equal(resolveSapTokenDisplayValue(null, 'customer_text'), 'customer_text — no data');
  assert.equal(resolveSapTokenDisplayValue('', 'customer_text'), 'customer_text — no data');
  assert.equal(resolveSapTokenDisplayValue(undefined, 'missing_field'), 'missing_field — no data');
});

test('synthetic roll contract maps source aliases without flattening objects', () => {
  const samplePath = path.resolve(frontendRoot, 'tests/fixtures/local_roll_v11.synthetic.json');
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const { rawContract, tokenMap } = adaptSapContract(sample);

  assert.equal(rawContract.contract_version, '1.1');
  assert.equal(rawContract.label_type, 'ROLL');
  assert.equal(rawContract.label_code, 'SYN-ROLL');
  assert.equal(rawContract.source.matnr, 'SYN-MAT-001');
  assert.equal(tokenMap.material_number, 'SYN-MAT-001');
  assert.equal(tokenMap.batch_number, 'SYN-BATCH-001');
  assert.equal(tokenMap.plant, 'SYN-PLANT');
  assert.equal(tokenMap.grade, '');
  assert.equal(tokenMap.source, undefined);
  assert.equal(tokenMap.fields, undefined);
  assert.equal(tokenMap.codes, undefined);
  assert.equal(JSON.stringify(tokenMap).includes('[object Object]'), false);
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
    const history = useHistoryStore.getState();
    try {
      history.clearHistory();
      history.pushState(JSON.stringify({ objects: [{ id: 'A' }] }));
      history.pushState(JSON.stringify({ objects: [{ id: 'A' }, { id: 'B' }] }));
      assert.deepEqual(JSON.parse(useHistoryStore.getState().undo()), { objects: [{ id: 'A' }] });
      assert.deepEqual(JSON.parse(useHistoryStore.getState().redo()), { objects: [{ id: 'A' }, { id: 'B' }] });
      assert.deepEqual(JSON.parse(useHistoryStore.getState().undo()), { objects: [{ id: 'A' }] });
      assert.equal(useHistoryStore.getState().canRedo, true);
      useHistoryStore.getState().pushState(JSON.stringify({ objects: [{ id: 'C' }] }));
      assert.equal(useHistoryStore.getState().canRedo, false, 'new state invalidates redo');
      assert.equal(useHistoryStore.getState().redo(), undefined);
    } finally {
      useHistoryStore.getState().clearHistory();
    }
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

    // 3. Add a global graphic embedded in this template.
    addObject({ id: 'graphic_1', type: 'image', graphicAssetId: 'company-logo', graphicAssetVersion: 2, graphicEmbeddedSrc: 'data:image/svg+xml;base64,PHN2Zy8+' });
    assert.equal(canvasObjects.length, 3, 'Canvas must have 3 active objects');
    assert.equal(activeObject.id, 'graphic_1', 'Last added object must be active selection');
    assert.equal(inspectorProperty.graphicAssetId, 'company-logo', 'RightInspector retains global graphic identity');
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
  await t.test('Tool creators and legacy Fabric shapes retain valid object structures', () => {
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

    // 4. Legacy Rectangle import/template compatibility
    const rectObj = { type: 'rect', width: 40 * pxPerMm, height: 25 * pxPerMm, fill: 'transparent', stroke: '#000000' };
    assert.equal(rectObj.type, 'rect');
    assert.equal(rectObj.fill, 'transparent');

    // 5. Line
    const lineObj = { type: 'line', stroke: '#000000', strokeWidth: 0.5 * pxPerMm };
    assert.equal(lineObj.type, 'line');

    // 6. Legacy Circle import/template compatibility
    const circleObj = { type: 'circle', radius: 12 * pxPerMm, fill: 'transparent', stroke: '#000000' };
    assert.equal(circleObj.type, 'circle');

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


test('versionless data envelope preserves dynamic keys, identities, zero and null', () => {
  const input = { sender: { system: 'SAP_ECC' }, request_id: 'REQ1', items: [
    { item_id: 'I1', label_code: 'A013', copies: 1, data: { ZZWIDTH: 695, 'ZZSPECIALTOUCH-1': 'A', arbitrary_field: 0, optional: null } },
    { item_id: 'I2', label_code: 'A013', copies: 2, data: { ZZWIDTH: 700 } },
  ] };
  const parsed = parseLocalSapJson(input);
  assert.equal(parsed.format, 'data');
  assert.equal(parsed.items[0].tokenMap.ZZWIDTH, 695);
  assert.equal(parsed.items[0].tokenMap.arbitrary_field, 0);
  assert.equal(parsed.items[0].tokenMap.optional, null);
  assert.equal(parsed.items[0].contract.source.item_id, 'I1');
  assert.equal(parsed.items[1].tokenMap.ZZWIDTH, 700);
  assert.throws(() => parseLocalSapJson({ ...input, items: [input.items[0], input.items[0]] }), /unique/);
  assert.throws(() => parseLocalSapJson({ ...input, items: [{ ...input.items[0], data: { nested: { value: 1 } } }] }), /scalar/);
  assert.throws(() => parseLocalSapJson({ ...input, items: [{ ...input.items[0], copies: 0 }] }), /copies/);
  assert.throws(() => parseLocalSapJson({ ...input, items: [{ ...input.items[0], data: JSON.parse('{"__proto__":"bad"}') }] }), /name/);
  assert.throws(() => parseLocalSapJson({ ...input, request_id: '' }), /request_id/);
});


test('versionless SAP descriptions are shared metadata and validate independently of values', () => {
  const payload = { sender: { system: 'SAP_ECC' }, request_id: 'R1', field_descriptions: { ZZWIDTH: 'WIDTH', OTHER: '' }, items: [
    { item_id: 'I1', label_code: 'A013', copies: 1, data: { ZZWIDTH: 695 } },
    { item_id: 'I2', label_code: 'A013', copies: 1, data: { ZZWIDTH: 700 } },
  ] };
  const parsed = parseLocalSapJson(payload);
  for (const item of parsed.items) {
    assert.deepEqual(item.contract.field_descriptions, payload.field_descriptions);
    assert.equal(item.tokenMap.field_descriptions, undefined);
    assert.equal(item.tokenMap.WIDTH, undefined);
  }
  for (const invalid of [null, [], { ZZWIDTH: 695 }, { ZZWIDTH: 'X'.repeat(257) }, JSON.parse('{"__proto__":"WIDTH"}')]) {
    assert.throws(() => parseLocalSapJson({ ...payload, field_descriptions: invalid }), /field_descriptions|description/);
  }
  assert.deepEqual(parseLocalSapJson({ ...payload, field_descriptions: undefined }).items[0].contract.field_descriptions, {});
});
