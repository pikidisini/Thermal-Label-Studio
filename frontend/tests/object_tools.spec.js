import { test, expect } from '@playwright/test';

test.describe('Fitur 2 - Toolbox Vector Elements & Token Insertion Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('[data-testid="canvas-container"]').waitFor({ state: 'visible', timeout: 15000 });
  });

  // TC-TOOL-01: Insertion of CAD Toolbox Core Elements (Text, Barcode, QR Code)
  test('TC-TOOL-01: Insert Core Elements (Text, Barcode 1D, QR Code 2D)', async ({ page }) => {
    // 1. Insert Text Element
    const btnText = page.locator('[data-testid="btn-add-text"]').first();
    await expect(btnText).toBeVisible();
    await btnText.click();

    // Verify Inspector reflects Text
    await expect(page.getByTestId('inspector-x')).toBeVisible();
    await expect(page.getByText('Transform Inspector')).toBeVisible();

    // 2. Insert Barcode (Code128)
    const btnBarcode = page.locator('[data-testid="btn-add-barcode"]').first();
    await expect(btnBarcode).toBeVisible();
    await btnBarcode.click();

    // Verify Coordinates exist in Inspector
    const inspectorX = page.locator('[data-testid="inspector-x"]').first();
    await expect(inspectorX).toBeVisible();

    // 3. Insert QR Code
    const btnQrCode = page.locator('[data-testid="btn-add-qrcode"]').first();
    await expect(btnQrCode).toBeVisible();
    await btnQrCode.click();

    // Verify Transform Inspector is active
    await expect(page.getByText('Transform Inspector')).toBeVisible();
  });

  // TC-TOOL-02: The remaining line tool stays available; Rect/Circle are legacy import-only.
  test('TC-TOOL-02: Insert separator line without Rect/Circle creation tools', async ({ page }) => {
    const btnLine = page.locator('[data-testid="btn-add-line"]').first();
    await expect(btnLine).toBeVisible();
    await btnLine.click();

    await expect(page.getByTestId('btn-add-rect')).toHaveCount(0);
    await expect(page.getByTestId('btn-add-circle')).toHaveCount(0);
  });

  // TC-TOOL-04: SAP Token Drawer Insertion (+Text, +Bar, +QR)
  test('TC-TOOL-04: SAP Token Insertion (+Text, +Bar, +QR)', async ({ page }) => {
    // 1. Check Drawer visibility
    await page.getByTestId('dock-btn-sap').click();
    await expect(page.getByText('SAP Tokens')).toBeVisible();

    // Hover over first token card to expose multi-action buttons
    const firstTokenCard = page.locator('[data-testid^="sap-token-card-"]').first();
    await expect(firstTokenCard).toBeVisible();
    await firstTokenCard.hover();

    // 2. Add first available token as Dynamic Text
    const btnAddTokenText = firstTokenCard.locator('[data-testid$="-text"]').first();
    await expect(btnAddTokenText).toBeVisible();
    await btnAddTokenText.click();

    // Verify Dynamic Text added in Inspector
    await expect(page.getByTestId('inspector-x')).toBeVisible();

    // 3. Add token as Barcode
    await firstTokenCard.hover();
    const btnAddTokenBar = firstTokenCard.locator('[data-testid$="-barcode"]').first();
    await expect(btnAddTokenBar).toBeVisible();
    await btnAddTokenBar.click();

    // 4. Add token as QR Code
    await firstTokenCard.hover();
    const btnAddTokenQr = firstTokenCard.locator('[data-testid$="-qr"]').first();
    await expect(btnAddTokenQr).toBeVisible();
    await btnAddTokenQr.click();

    // Verify Inspector has active properties
    const inspectorX = page.locator('[data-testid="inspector-x"]').first();
    await expect(inspectorX).toBeVisible();
  });
});
