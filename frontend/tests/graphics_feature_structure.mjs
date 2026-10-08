import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve(import.meta.dirname, '../src');
const read = (...segments) => fs.readFileSync(path.join(sourceRoot, ...segments), 'utf8');

test('F3.38 Graphics has one feature-owned public API', () => {
  const publicApi = read('features', 'graphics', 'index.ts');
  for (const exportName of ['graphicsApi', 'GraphicAsset', 'useGraphicActions', 'GraphicsSection', 'GraphicUpdateCenterModal']) {
    assert.match(publicApi, new RegExp(exportName));
  }
  for (const relativePath of [
    ['features', 'graphics', 'api', 'graphicsApi.ts'],
    ['features', 'graphics', 'hooks', 'useGraphicActions.ts'],
    ['features', 'graphics', 'model', 'graphicTypes.ts'],
    ['features', 'graphics', 'ui', 'GraphicsSection.tsx'],
    ['features', 'graphics', 'ui', 'GraphicUpdateCenterModal.tsx'],
  ]) {
    assert.equal(fs.existsSync(path.join(sourceRoot, ...relativePath)), true);
  }
});

test('F3.38 shell and canvas aggregator import Graphics only through its feature API', () => {
  const leftToolbox = read('components', 'layout', 'LeftToolbox.tsx');
  const studio = read('components', 'studio', 'Studio.tsx');
  const canvasActions = read('hooks', 'useCanvasActions.ts');
  for (const source of [leftToolbox, canvasActions]) {
    assert.match(source, /features\/graphics/);
    assert.doesNotMatch(source, /utils\/api\/graphicsApi|useSymbolActions|GraphicUpdateCenterModal'\s*from '\.\.\/modals/);
  }
  assert.doesNotMatch(studio, /GraphicUpdateCenterModal|graphicUpdateOpen/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'utils', 'api', 'graphicsApi.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'hooks', 'canvas', 'useSymbolActions.ts')), false);
});

test('F3.38 standalone Upload Image / Logo remains separate from global Graphics', () => {
  const graphicActions = read('features', 'graphics', 'hooks', 'useGraphicActions.ts');
  const imageActions = read('features', 'images', 'hooks', 'useImageActions.ts');
  const canvasActions = read('hooks', 'useCanvasActions.ts');
  assert.doesNotMatch(graphicActions, /handleUploadImage|FileReader/);
  assert.match(imageActions, /handleUploadImage/);
  assert.match(canvasActions, /features\/images/);
  assert.match(canvasActions, /useGraphicActions/);
  assert.match(canvasActions, /useImageActions/);
});

test('F3.39 Line and Snapping expose public feature boundaries', () => {
  const lineIndex = read('features', 'line', 'index.ts');
  const snappingIndex = read('features', 'snapping', 'index.ts');
  const canvasActions = read('hooks', 'useCanvasActions.ts');
  const drawingTools = read('hooks', 'canvas', 'useDrawingTools.ts');
  const fabricCanvas = read('features', 'canvas', 'editor', 'useFabricCanvas.ts');
  for (const exportedName of ['useLineActions', 'LineInspector', 'applyLinePropertyUpdate', 'snapLineEnd']) assert.match(lineIndex, new RegExp(exportedName));
  for (const exportedName of ['snapLinePoint', 'snapExactLineEndpoint', 'snapMovingObject', 'createSmartGuideOverlay']) assert.match(snappingIndex, new RegExp(exportedName));
  assert.match(canvasActions, /features\/line/);
  assert.match(drawingTools, /features\/line/);
  assert.match(drawingTools, /features\/snapping/);
  assert.match(fabricCanvas, /features\/snapping/);
  assert.doesNotMatch(drawingTools, /features\/(line|snapping)\/(canvas|editor|model|ui)/);
  assert.doesNotMatch(fabricCanvas, /features\/snapping\/(canvas|editor|model|ui)/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'hooks', 'canvas', 'useShapeActions.ts')), false);
});

test('F3.40 Text owns its actions and font picker model', () => {
  const textIndex = read('features', 'text', 'index.ts');
  const textControls = read('features', 'text', 'ui', 'TextFormatControls.tsx');
  const fontOptions = read('features', 'text', 'model', 'fontOptions.ts');
  const canvasActions = read('hooks', 'useCanvasActions.ts');
  const ribbon = read('components', 'layout', 'PropertyRibbon.tsx');
  for (const exportedName of ['useTextActions', 'TextFormatControls', 'FONT_OPTIONS']) assert.match(textIndex, new RegExp(exportedName));
  assert.match(textControls, /model\/fontOptions/);
  assert.match(fontOptions, /Trebuchet MS/);
  assert.match(fontOptions, /JetBrains Mono/);
  assert.match(canvasActions, /features\/text/);
  assert.match(ribbon, /features\/text/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'features', 'text', 'hooks', 'useTextActions.ts')), true);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'features', 'text', 'editor', 'useTextActions.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'components', 'layout', 'ribbon', 'TextFormatControls.tsx')), false);
});

test('F3.41 Barcode and QR own generators and public feature APIs', () => {
  const barcodeIndex = read('features', 'barcode', 'index.ts');
  const qrIndex = read('features', 'qr', 'index.ts');
  const barcodePreview = read('features', 'barcode', 'model', 'barcodePreview.ts');
  const canvasActions = read('hooks', 'useCanvasActions.ts');
  const ribbon = read('components', 'layout', 'PropertyRibbon.tsx');
  assert.match(barcodeIndex, /useBarcodeActions/);
  assert.match(barcodeIndex, /useBarcodeTokenActions/);
  assert.match(barcodeIndex, /resolvePayloadTemplate/);
  assert.match(qrIndex, /qrGenerator/);
  assert.match(qrIndex, /useQrActions/);
  assert.match(canvasActions, /features\/barcode/);
  assert.match(canvasActions, /features\/qr/);
  assert.match(barcodePreview, /from '..\/..\/qr\/model\/qrGenerator'/);
  assert.match(ribbon, /features\/barcode/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'utils', 'barcodeGenerators.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'utils', 'barcodePayload.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'utils', 'barcodePreview.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'features', 'qr', 'hooks', 'useQrActions.ts')), true);
});

test('F3.42 application domains expose public feature owners while shell remains generic', () => {
  const templatesIndex = read('features', 'templates', 'index.ts');
  const simulationIndex = read('features', 'simulation', 'index.ts');
  const studio = read('components', 'studio', 'Studio.tsx');
  const topMenu = read('components', 'layout', 'TopMenuBar.tsx');

  for (const exportedName of ['useTemplateManager', 'TemplateSelector', 'SaveTemplateModal']) assert.match(templatesIndex, new RegExp(exportedName));
  for (const exportedName of ['useThermalSimulation', 'EditorSimulationModal']) assert.match(simulationIndex, new RegExp(exportedName));
  assert.match(studio, /features\/templates/);
  assert.match(studio, /features\/simulation/);
  assert.doesNotMatch(studio, /features\/print|features\/auth/);
  assert.match(topMenu, /features\/templates/);
  assert.doesNotMatch(studio, /hooks\/useTemplateManager|hooks\/useThermalSimulation|components\/modals\/(PrintModal|SaveTemplateModal|SafeDemoModal|SapShadowSimulationModal)/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'hooks', 'useTemplateManager.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'hooks', 'useThermalSimulation.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'components', 'modals', 'PrintModal.tsx')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'components', 'modals', 'SaveTemplateModal.tsx')), false);
});

test('F3.44 shared UI exposes semantic primitives and tokens without editor migration', () => {
  const sharedIndex = read('shared', 'ui', 'index.ts');
  const primitives = read('shared', 'ui', 'primitives.tsx');
  const css = read('index.css');
  for (const name of ['Button', 'IconButton', 'Dialog', 'DialogHeader', 'DialogBody', 'DialogFooter', 'Field', 'Input', 'Select', 'Badge', 'Status', 'EmptyState', 'ErrorState']) assert.match(primitives, new RegExp(`export (function|const) ${name}`));
  assert.match(sharedIndex, /primitives/);
  for (const token of ['--ui-surface-base', '--ui-text-primary', '--ui-border-default', '--ui-primary', '--ui-success', '--ui-warning', '--ui-danger', '--ui-focus', '--ui-space-4', '--ui-radius-control']) assert.match(css, new RegExp(token));
});

test('F3.46 Templates use shared UI controls while keeping explorer actions', () => {
  const selector = read('features', 'templates', 'ui', 'TemplateSelector.tsx');
  const save = read('features', 'templates', 'ui', 'SaveTemplateModal.tsx');
  assert.match(selector, /shared\/ui/);
  assert.match(save, /shared\/ui/);
  assert.match(selector, /layoutApi\.get/);
  assert.doesNotMatch(selector, /apiClient|createTemplateFolder|moveTemplate/);
  assert.match(save, /onSave\(templateId\.trim\(\), templateName\.trim\(\)\)/);
});

test('F3.50 diagnostics and shortcut help use shared UI without changing actions or layering', () => {
  const diagnostics = read('features', 'diagnostics', 'ui', 'AiDiagnosticsModal.tsx');
  const shortcuts = read('components', 'modals', 'ShortcutHelpModal.tsx');
  for (const source of [diagnostics, shortcuts]) {
    assert.match(source, /shared\/ui/);
    assert.match(source, /<Dialog/);
    assert.match(source, /DialogHeader/);
    assert.match(source, /DialogFooter/);
    assert.match(source, /z-\[var\(--ui-layer-modal\)\]/);
  }
  assert.match(diagnostics, /sessionRecorder\.copyReportToClipboard/);
  assert.match(diagnostics, /sessionRecorder\.downloadReport/);
  assert.match(diagnostics, /sessionRecorder\.generateReport/);
  assert.match(shortcuts, /SHORTCUT_GROUPS/);
  assert.match(shortcuts, /onClick=\{onClose\}/);
});

test('F3.51 top menu and status bar use shared UI without changing controls', () => {
  const topMenu = read('components', 'layout', 'TopMenuBar.tsx');
  const topActions = read('components', 'layout', 'topbar', 'TopBarActions.tsx');
  const status = read('components', 'layout', 'StatusBar.tsx');
  for (const source of [topMenu, topActions, status]) assert.match(source, /shared\/ui/);
  for (const testId of ['topbar-menu-items', 'btn-topbar-print']) assert.match(topMenu + topActions, new RegExp(`data-testid=\\"${testId}\\"`));
  for (const testId of ['statusbar-btn-zoom-out', 'statusbar-btn-zoom-reset', 'statusbar-btn-zoom-in', 'statusbar-btn-zoom-fit']) assert.match(status, new RegExp(`data-testid=\\"${testId}\\"`));
  assert.match(topMenu, /document\.addEventListener\('mousedown', closeWhenClickingOutside\)/);
  assert.match(topMenu, /event\.key === 'Escape'/);
  assert.doesNotMatch(topMenu, /logout|useAuthStore/);
  assert.match(topMenu, /label: 'Label Simulation', action: props\.onOpenLabelSimulation, testId: 'btn-label-simulation'/);
  assert.doesNotMatch(topActions, /onOpenLabelSimulation|btn-label-simulation/);
  assert.match(status, /triggerFit/);
  assert.match(status, /triggerReset100/);
});

test('F3.52 property ribbon and toolbox use shared UI without changing tool wiring', () => {
  const ribbon = read('components', 'layout', 'PropertyRibbon.tsx');
  const geometry = read('components', 'layout', 'ribbon', 'GeometryFormatControls.tsx');
  const toolbox = read('components', 'layout', 'LeftToolbox.tsx');
  const basicTools = read('components', 'layout', 'toolbox', 'BasicToolsSection.tsx');
  const dock = read('components', 'layout', 'toolbox', 'DockButton.tsx');
  for (const source of [ribbon, geometry, toolbox]) assert.match(source, /shared\/ui/);
  for (const testId of ['ribbon-toggle-snap', 'ribbon-toggle-guides']) assert.match(ribbon, new RegExp(`data-testid=\\"${testId}\\"`));
  for (const action of ['toggleSnap', 'toggleGuides', 'onBringForward', 'onSendBackward', 'onDuplicate', 'onDelete']) assert.match(ribbon + geometry, new RegExp(action));
  for (const testId of ['dock-btn-tools', 'dock-btn-graphics', 'dock-btn-sap', 'btn-close-toolbox-flyout']) assert.match(toolbox, new RegExp(`testId=\\"${testId}\\"|data-testid=\\"${testId}\\"`));
  for (const action of ['onAddText', 'onAddBarcode', 'onAddQrCode', 'onAddLine', 'onUploadImage']) assert.match(basicTools, new RegExp(action));
  assert.doesNotMatch(basicTools, /TableGridPicker|btn-add-table|crop_square|circle/);
  assert.match(dock, /z-\[var\(--ui-layer-tooltip\)\]/);
});

test('F3.53 right inspector panels use shared UI without changing object controls', () => {
  const inspector = read('components', 'layout', 'RightInspector.tsx');
  const inspectorTab = read('components', 'layout', 'inspector', 'InspectorTab.tsx');
  const layers = read('components', 'layout', 'inspector', 'LayersTab.tsx');
  const properties = read('components', 'layout', 'inspector', 'ObjectPropertyForm.tsx');
  const align = read('components', 'layout', 'inspector', 'TransformMatrixTab.tsx');
  for (const source of [inspectorTab, layers, properties, align]) assert.match(source, /shared\/ui/);
  for (const tab of ['properties', 'layers', 'transform']) assert.match(inspector, new RegExp(`id: '${tab}'`));
  for (const testId of ['layers-btn-bring-forward', 'layers-btn-send-backward', 'layers-btn-duplicate', 'layers-btn-group', 'layers-btn-ungroup', 'layers-btn-delete']) assert.match(layers, new RegExp(`testId=\\"${testId}\\"`));
  for (const action of ['toggleVisibility', 'toggleLock', 'onSelectLayer', 'onBringForward', 'onSendBackward', 'onDuplicate', 'onDelete']) assert.match(layers, new RegExp(action));
  for (const prop of ['leftMm', 'topMm', 'angle', 'strokeWidthMm']) assert.match(properties, new RegExp(prop));
  for (const testId of ['align-btn-left', 'align-btn-center-h', 'align-btn-right', 'align-btn-top', 'align-btn-center-v', 'align-btn-bottom']) assert.match(align, new RegExp(`testId: '${testId}'`));
  assert.match(align, /onUpdateProperty\(map\[type\]\[0\], map\[type\]\[1\]\)/);
});

test('F3.54 Template Explorer uses a document-body modal portal above chrome', () => {
  const selector = read('features', 'templates', 'ui', 'TemplateSelector.tsx');
  assert.match(selector, /import \{ createPortal \} from 'react-dom'/);
  assert.match(selector, /createPortal\(<div role="dialog"/);
  assert.match(selector, /document\.body/);
  assert.match(selector, /data-testid="template-explorer-modal-overlay"/);
  assert.match(selector, /z-\[var\(--ui-layer-modal\)\]/);
  assert.match(selector, /if \(!busy && e\.target === e\.currentTarget\) setOpen\(false\)/);
  assert.match(selector, /e\.key === 'Escape'/);
  assert.match(selector, /onSelectTemplate\(selected\.id\)/);
});

test('F3.55 removes only proven-unused compatibility aliases', () => {
  assert.equal(fs.existsSync(path.join(sourceRoot, 'utils', 'localSapJsonParser.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'components', 'layout', 'ThermalPreviewSplit.tsx')), false);
  assert.match(read('features', 'data-tokens', 'index.ts'), /readLocalSapJson/);
});

test('F3.56 Data Tokens callers use the public feature API instead of legacy utility adapters', () => {
  const barrel = read('features', 'data-tokens', 'index.ts');
  const contractStore = read('store', 'useContractStore.ts');
  const frontendTests = read('..', 'tests', 'test_frontend.mjs');
  assert.match(barrel, /adaptSapContract/);
  assert.match(barrel, /resolveSapTokenDisplayValue/);
  assert.match(contractStore, /from '\.\.\/features\/data-tokens'/);
  assert.match(frontendTests, /from '\.\.\/src\/features\/data-tokens\/index\.ts'/);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'utils', 'sapContractAdapter.ts')), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'utils', 'sapTokenValue.ts')), false);
});

test('F3.57 Canvas keeps lifecycle ownership separate from cross-tool orchestration', () => {
  const canvasIndex = read('features', 'canvas', 'index.ts');
  const studio = read('components', 'studio', 'Studio.tsx');
  const canvasLifecycle = read('features', 'canvas', 'editor', 'useFabricCanvas.ts');
  const canvasActions = read('hooks', 'useCanvasActions.ts');
  const drawingTools = read('hooks', 'canvas', 'useDrawingTools.ts');
  const placement = read('hooks', 'canvas', 'usePlacementHelper.ts');

  assert.match(canvasIndex, /StudioCanvas/);
  assert.match(canvasIndex, /useFabricCanvas/);
  assert.match(studio, /import\s*\{[^}]*\bStudioCanvas\b[^}]*\}\s*from '\.\.\/\.\.\/features\/canvas'/);
  assert.doesNotMatch(studio, /features\/canvas\/(ui|editor|ruler|svg|draft)\//);
  assert.match(canvasLifecycle, /attachDrawingToolListeners/);
  for (const featurePath of ['features\/line', 'features\/text', 'features\/barcode', 'features\/qr', 'features\/graphics', 'features\/images']) {
    assert.match(canvasActions, new RegExp(featurePath));
  }
  assert.match(canvasActions, /usePlacementHelper/);
  assert.match(drawingTools, /features\/line/);
  assert.match(drawingTools, /features\/snapping/);
  assert.match(placement, /getStrategicPlacement/);
});

test('F3.59 removes the retired grid feature without removing core editor tools', () => {
  const studio = read('components', 'studio', 'Studio.tsx');
  const basicTools = read('components', 'layout', 'toolbox', 'BasicToolsSection.tsx');
  const canvasActions = read('hooks', 'useCanvasActions.ts');
  const drawingTools = read('hooks', 'canvas', 'useDrawingTools.ts');
  const activeTool = read('types', 'label.ts');
  const importer = read('features', 'canvas', 'svg', 'fabricSvgImporter.ts');
  const exporter = read('features', 'canvas', 'svg', 'fabricSvgExporter.ts');

  for (const removedPath of [
    ['features', 'table'],
    ['hooks', 'canvas', 'useTableActions.ts'],
    ['utils', 'tableSpec.ts'],
    ['components', 'layout', 'toolbox', 'TableGridPicker.tsx'],
  ]) assert.equal(fs.existsSync(path.join(sourceRoot, ...removedPath)), false);

  for (const source of [studio, basicTools, canvasActions, drawingTools, activeTool, importer, exporter]) {
    assert.doesNotMatch(source, /features\/table|useTableActions|TableGridPicker|tableSpec|activeTool.*table|data-table-spec/i);
  }
  for (const action of ['onAddText', 'onAddBarcode', 'onAddQrCode', 'onAddLine', 'onUploadImage']) assert.match(basicTools, new RegExp(action));
  for (const tool of ["'select'", "'text'", "'barcode'", "'qrcode'", "'line'", "'image'"]) assert.match(activeTool, new RegExp(tool));
  for (const featurePath of ['features\\/line', 'features\\/text', 'features\\/barcode', 'features\\/qr', 'features\\/graphics', 'features\\/images']) {
    assert.match(canvasActions, new RegExp(featurePath));
  }
});

test('F3.60 uses one Fabric import strategy and avoids SSR layout-effect warnings', () => {
  const qrActions = read('features', 'qr', 'hooks', 'useQrActions.ts');
  const studioCanvas = read('features', 'canvas', 'ui', 'StudioCanvas.tsx');
  const anchoredOverlay = read('shared', 'ui', 'layers', 'AnchoredOverlay.tsx');
  const effectHelper = read('shared', 'ui', 'useIsomorphicLayoutEffect.ts');

  assert.match(qrActions, /import \* as fabric from 'fabric'/);
  assert.match(qrActions, /fabric\.FabricImage\.fromURL/);
  assert.doesNotMatch(qrActions, /import\('fabric'\)/);
  assert.match(effectHelper, /typeof window !== 'undefined' && typeof window\.document !== 'undefined'/);
  assert.match(effectHelper, /\? useLayoutEffect/);
  assert.match(effectHelper, /: useEffect/);
  for (const source of [studioCanvas, anchoredOverlay]) {
    assert.match(source, /useIsomorphicLayoutEffect/);
    assert.doesNotMatch(source, /\buseLayoutEffect\(/);
  }
});
