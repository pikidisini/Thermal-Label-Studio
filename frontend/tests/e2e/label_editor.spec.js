import { test, expect } from '@playwright/test';

test.describe('Thermal Label Studio - Studio Canvas & Controls', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local dev server
    await page.goto('/');
    // Wait for the app header to be visible
    await expect(page.locator('header')).toBeVisible();
  });

  test('TC-CANVAS-01: Application loads with header, menus, and canvas container', async ({ page }) => {
    // Check Brand Title
    await expect(page.getByText('Thermal Label Studio')).toBeVisible();

    // Check View Mode Switcher buttons (2 modes: Design & Preview)
    await expect(page.getByTestId('btn-view-mode-design')).toBeVisible();
    await expect(page.getByTestId('btn-view-mode-preview')).toBeVisible();
    await expect(page.getByTestId('btn-view-mode-split')).not.toBeVisible();

    // Check Action Buttons
    await expect(page.getByTestId('btn-topbar-print')).toBeVisible();

    // Check AI Diagnostics button
    await expect(page.getByTestId('btn-ai-diagnostics')).toBeVisible();
  });

  test('TC-CANVAS-02: View mode switching works smoothly between Design and Preview', async ({ page }) => {
    const previewBtn = page.getByTestId('btn-view-mode-preview');
    const designBtn = page.getByTestId('btn-view-mode-design');

    // Initially in Design mode
    await expect(designBtn).toHaveClass(/bg-primary/);

    // Switch to Preview Mode
    await previewBtn.click();
    await expect(previewBtn).toHaveClass(/bg-primary/);
    await expect(designBtn).not.toHaveClass(/bg-primary/);

    // Switch back to Design Mode
    await designBtn.click();
    await expect(designBtn).toHaveClass(/bg-primary/);
    await expect(previewBtn).not.toHaveClass(/bg-primary/);
  });

  test('TC-CANVAS-03: AI Diagnostics modal opens, captures state, and can be closed', async ({ page }) => {
    // Click AI Debug button in header
    await page.getByTestId('btn-ai-diagnostics').click();

    // Verify modal elements
    await expect(page.getByText('AI Session Diagnostics & Telemetry')).toBeVisible();
    await expect(page.getByText('Preview Markdown Report:')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salin untuk Chat AI' })).toBeVisible();

    // Close modal
    await page.getByTitle('Tutup Modal').click();
    await expect(page.getByText('AI Session Diagnostics & Telemetry')).not.toBeVisible();
  });
});
