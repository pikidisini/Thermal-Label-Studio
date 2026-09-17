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

  // TC-TOOL-02: Insertion of Geometric Primitives & Manifest Table (Box, Line, Circle, Table)
  test('TC-TOOL-02: Insert Geometric Primitives (Box, Line, Circle, Table)', async ({ page }) => {
    // 1. Insert Box Frame (Rect)
    const btnRect = page.locator('[data-testid="btn-add-rect"]').first();
    await expect(btnRect).toBeVisible();
    await btnRect.click();

    // 2. Insert Separator Line
    const btnLine = page.locator('[data-testid="btn-add-line"]').first();
    await expect(btnLine).toBeVisible();
    await btnLine.click();

    // 3. Insert Circle / Badge
    const btnCircle = page.locator('[data-testid="btn-add-circle"]').first();
    await expect(btnCircle).toBeVisible();
    await btnCircle.click();

    // 4. Insert Manifest Table Grid
    const btnTable = page.locator('[data-testid="btn-add-table"]').first();
    await expect(btnTable).toBeVisible();
    await btnTable.click();

    // Verify Coordinate inputs in Inspector
    const inspectorX = page.locator('[data-testid="inspector-x"]').first();
    await expect(inspectorX).toBeVisible();
    await expect(page.getByText('Transform Inspector')).toBeVisible();
  });

  // TC-TOOL-03: Industrial Hazard Pictograms & ISO Symbols
  test('TC-TOOL-03: Insert Industrial Symbols & GHS Hazard Pictograms', async ({ page }) => {
    // 1. Add Default ISO Symbol (Fragile)
    await page.getByTestId('dock-btn-symbols').click();
    const btnSymbol = page.locator('[data-testid^="btn-symbol-"]').first();
    await expect(btnSymbol).toBeVisible();
    await btnSymbol.click();

    // 2. Add GHS Flammable from Drawer
    const btnGhsFlammable = page.locator('button:has-text("FLAM")').first();
    if (await btnGhsFlammable.isVisible()) {
      await btnGhsFlammable.click();
    }

    // 3. Add GHS Toxic from Drawer
    const btnGhsToxic = page.locator('button:has-text("TOXIC")').first();
    if (await btnGhsToxic.isVisible()) {
      await btnGhsToxic.click();
    }

    // Verify Transform Inspector is active
    await expect(page.getByText('Transform Inspector')).toBeVisible();
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
