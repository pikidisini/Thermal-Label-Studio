import { expect } from '@playwright/test';

/** Check the browser download and read the exact Blob used by its object URL. */
export async function downloadTemplateSvg(page) {
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    const blobs = new Map();
    URL.createObjectURL = function (blob) {
      const url = original.call(this, blob);
      if (blob instanceof Blob && blob.type === 'image/svg+xml') blobs.set(url, blob.text());
      return url;
    };
    window.__tlsSvgDownload = { blobs, restore: () => { URL.createObjectURL = original; } };
  });
  try {
    await page.getByTestId('topbar-menu-btn-file').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('topbar-menuitem-file-5').click(),
    ]);
    expect(download.suggestedFilename()).toBe('thermal-template.svg');
    const content = await page.evaluate(url => {
      const blob = window.__tlsSvgDownload.blobs.get(url);
      if (!blob) throw new Error('The SVG download did not use a captured export Blob.');
      return blob;
    }, download.url());
    expect(content).toMatch(/^<svg\b/);
    return content;
  } finally {
    if (!page.isClosed()) await page.evaluate(() => {
      window.__tlsSvgDownload?.restore();
      delete window.__tlsSvgDownload;
    });
  }
}
