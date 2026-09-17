import { test, expect } from '@playwright/test';

test.describe('Fitur Zoom, Pan & Viewport Auto-Fit Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('[data-testid="canvas-container"]').waitFor({ state: 'visible', timeout: 15000 });
  });

  // TC-ZOOM-E2E-01: Auto-Fit on Startup
  test('TC-ZOOM-E2E-01: Auto-Fit on Startup must fit canvas inside viewport without overflowing', async ({ page }) => {
    const viewport = page.locator('#canvas-container-root').first();
    await expect(viewport).toBeVisible();

    const containerBox = await viewport.boundingBox();
    expect(containerBox).not.toBeNull();

    // Verify viewport container does not overflow viewport boundaries
    const viewportEl = page.locator('#canvas-container-root').locator('..');
    const viewportBox = await viewportEl.boundingBox();
    expect(viewportBox).not.toBeNull();

    if (containerBox && viewportBox) {
      // Container width must fit within viewport with margins
      expect(containerBox.width).toBeLessThanOrEqual(viewportBox.width);
      expect(containerBox.height).toBeLessThanOrEqual(viewportBox.height);
    }
  });

  // TC-ZOOM-E2E-02: Quick Zoom In / Zoom Out Controls in StatusBar
  test('TC-ZOOM-E2E-02: Quick Zoom In and Zoom Out controls in StatusBar', async ({ page }) => {
    const zoomButton = page.locator('footer button[title*="Reset Zoom"]').first();
    await expect(zoomButton).toBeVisible();

    const initialText = await zoomButton.innerText();

    // Click Zoom In button
    const zoomInBtn = page.locator('footer button[title*="Zoom In"]').first();
    await zoomInBtn.click();
    await page.waitForTimeout(100);

    const zoomedInText = await zoomButton.innerText();
    expect(zoomedInText).not.toEqual(initialText);

    // Click Reset 100% button
    await zoomButton.click();
    await page.waitForTimeout(100);
    const resetText = await zoomButton.innerText();
    expect(resetText).toContain('100%');
  });

  // TC-ZOOM-E2E-03: Spacebar Hand / Pan Tool Interaction
  test('TC-ZOOM-E2E-03: Spacebar Hand tool enables grabbing cursor and pan movement', async ({ page }) => {
    const canvasContainer = page.locator('[data-testid="canvas-container"]').first();
    await expect(canvasContainer).toBeVisible();

    const initialTransform = await canvasContainer.evaluate((el) => el.style.transform);

    // Press and hold Spacebar
    await page.keyboard.down('Space');

    // Drag mouse across the canvas
    const box = await canvasContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 5 });
      await page.mouse.up({ button: 'left' });
    }

    // Release Spacebar
    await page.keyboard.up('Space');
    await page.waitForTimeout(100);

    const newTransform = await canvasContainer.evaluate((el) => el.style.transform);
    expect(newTransform).not.toEqual(initialTransform);
  });

  // TC-ZOOM-E2E-04: Keyboard Shortcut Reset 100% (Ctrl+1) and Fit (Ctrl+0)
  test('TC-ZOOM-E2E-04: Shortcut keys Ctrl+1 and Ctrl+0 trigger zoom reset and fit', async ({ page }) => {
    const zoomBtn = page.locator('footer button[title*="Reset Zoom"]').first();

    // Trigger Zoom In
    const zoomInBtn = page.locator('footer button[title*="Zoom In"]').first();
    await zoomInBtn.click();
    await zoomInBtn.click();

    // Press Ctrl + 1
    await page.keyboard.press('Control+Digit1');
    await page.waitForTimeout(100);

    const text100 = await zoomBtn.innerText();
    expect(text100).toContain('100%');

    // Press Ctrl + 0 (Auto Fit)
    await page.keyboard.press('Control+Digit0');
    await page.waitForTimeout(100);
    await expect(page.locator('[data-testid="canvas-container"]').first()).toBeVisible();
  });
});
