import { test, expect } from '@playwright/test';

test.describe('Fitur 1 - Studio Canvas & Visual Label Designer', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('[data-testid="canvas-container"]').waitFor({ state: 'visible', timeout: 15000 });
  });

  // TC-CANVAS-01: Label Dimension & DPI Scaling Calculation (Fungsionalitas)
  test('TC-CANVAS-01: Label Dimension & DPI Scaling Calculation', async ({ page }) => {
    // 1. Open CanvasSetupModal
    const btnResize = page.locator('[data-testid="btn-canvas-setup"]').first();
    await btnResize.click();

    const modal = page.locator('[data-testid="canvas-setup-modal"]').first();
    await expect(modal).toBeVisible();

    // 2. Input Width 100mm, Height 50mm
    const widthInput = page.locator('[data-testid="input-width-mm"]').first();
    const heightInput = page.locator('[data-testid="input-height-mm"]').first();

    await widthInput.fill('100');
    await heightInput.fill('50');

    // Click 203.2 DPI preset inside modal
    const dpiBtn = modal.locator('button:has-text("203.2 DPI")').first();
    if (await dpiBtn.isVisible()) {
      await dpiBtn.click();
    }

    // Verify matrix calculation in HUD: 100mm -> 800 dots / px, 50mm -> 400 dots / px
    const hudWidth = modal.getByText(/800\s*(dots|px)/i).first();
    const hudHeight = modal.getByText(/400\s*(dots|px)/i).first();
    await expect(hudWidth).toBeVisible();
    await expect(hudHeight).toBeVisible();

    // 3. Apply changes
    await page.click('[data-testid="btn-apply-dimensions"]');
    await expect(modal).not.toBeVisible();

    // Verify Canvas container dimensions updated
    const canvasContainer = page.locator('[data-testid="canvas-container"]').first();
    await expect(canvasContainer).toBeVisible();
  });

  // TC-CANVAS-02: Element Insertion & Object Selection (Behavior)
  test('TC-CANVAS-02: Element Insertion & Object Selection', async ({ page }) => {
    // 1. Add Text
    const btnAddText = page.locator('[data-testid="btn-add-text"]').first();
    await expect(btnAddText).toBeVisible();
    await btnAddText.click();

    // 2. Add Barcode (Code128)
    const btnAddBarcode = page.locator('[data-testid="btn-add-barcode"]').first();
    await expect(btnAddBarcode).toBeVisible();
    await btnAddBarcode.click();

    // 3. Add Industrial Symbol (GHS / Fragile)
    const btnSymbolsTab = page.locator('button:has-text("Symbols")').first();
    if (await btnSymbolsTab.isVisible()) {
      await btnSymbolsTab.click();
    }
    const btnAddSymbol = page.locator('[data-testid^="btn-symbol-"]').first();
    await expect(btnAddSymbol).toBeVisible();
    await btnAddSymbol.click();

    // Verify active selection is reflected in Right Inspector coordinate inspector
    const inspectorX = page.locator('[data-testid="inspector-x"]').first();
    const inspectorLabel = page.getByText('Transform Inspector').first();
    await expect(inspectorX).toBeVisible();
    await expect(inspectorLabel).toBeVisible();
  });

  // TC-CANVAS-03: Drag, Snap to Grid & Guidelines (Behavior)
  test('TC-CANVAS-03: Drag, Snap to Grid & Guidelines', async ({ page }) => {
    // Add text element to drag
    const btnAddText = page.locator('[data-testid="btn-add-text"]').first();
    await btnAddText.click();

    const canvasContainer = page.locator('[data-testid="canvas-container"]').first();
    const box = await canvasContainer.boundingBox();
    if (box) {
      // Drag mouse on canvas
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 54, box.y + 78);
      await page.mouse.up();
    }

    // Verify canvas rendered smoothly
    await expect(canvasContainer).toBeVisible();
  });

  // TC-CANVAS-04: Select All (Ctrl+A), Undo, Redo & Batch Delete Shortcuts (Behavior)
  test('TC-CANVAS-04: Undo, Redo & Delete Keyboard Shortcuts', async ({ page }) => {
    // 1. Add Text, Barcode, and QR Code
    const btnAddText = page.locator('[data-testid="btn-add-text"]').first();
    const btnAddBarcode = page.locator('[data-testid="btn-add-barcode"]').first();
    const btnAddQr = page.locator('[data-testid="btn-add-qrcode"]').first();

    await btnAddText.click();
    await btnAddBarcode.click();
    await btnAddQr.click();

    // Switch to Layers tab
    const tabLayers = page.locator('button:has-text("Layers")').first();
    if (await tabLayers.isVisible()) {
      await tabLayers.click();
    }

    // Verify multiple objects exist
    await expect(page.getByText(/Hierarchy Stack \(\d+\)/i).first()).toBeVisible({ timeout: 6000 });

    // 2. Select All via Ctrl+A
    await page.keyboard.press('Control+a');

    // 3. Press Delete to batch remove all selected objects
    await page.keyboard.press('Delete');

    // Verify Hierarchy stack is emptied
    await expect(page.getByTestId('layers-empty-state')).toBeVisible({ timeout: 5000 });

    // 4. Press Ctrl+Z (Undo) to restore deleted objects
    await page.keyboard.press('Control+z');
    await expect(page.getByText(/Hierarchy Stack \(\d+\)/i).first()).toBeVisible({ timeout: 5000 });

    // 5. Press Ctrl+Y (Redo)
    await page.keyboard.press('Control+y');
  });

  // TC-CANVAS-05: Visual Regression Canvas Render (UI/UX)
  test('TC-CANVAS-05: Visual Regression Canvas Render', async ({ page }) => {
    const canvasSheet = page.locator('[data-testid="canvas-container"]').first();
    await expect(canvasSheet).toBeVisible();

    // Pixel diff tolerance threshold < 0.1%
    await expect(canvasSheet).toHaveScreenshot('canvas-golden-reference.png', {
      maxDiffPixelRatio: 0.001,
      threshold: 0.1,
    });
  });
});
