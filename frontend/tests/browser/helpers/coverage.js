import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
const projectTmp = fileURLToPath(new URL('../../../../.tmp/', import.meta.url));

// Every UI test contributes its real JavaScript execution, including lazy pages.
// The normal browser gate leaves coverage disabled and uses production assets.
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const directory = process.env.TLS_COVERAGE_DIRECTORY;
    if (!directory) return use(page);
    if (!path.resolve(directory).startsWith(path.resolve(projectTmp) + path.sep)) {
      throw new Error('Coverage output must be inside project .tmp.');
    }
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    try {
      await use(page);
    } finally {
      const entries = await page.coverage.stopJSCoverage();
      if (testInfo.status === 'passed') {
        const result = entries.filter(entry => entry.url.startsWith('http')
          && new URL(entry.url).pathname.startsWith('/assets/')).map(entry => ({
          scriptId: entry.scriptId,
          functions: entry.functions,
          url: path.join(dist, decodeURIComponent(new URL(entry.url).pathname)),
        }));
        mkdirSync(directory, { recursive: true });
        writeFileSync(path.join(directory, `coverage-browser-${randomUUID()}.json`), JSON.stringify({ result }));
      }
    }
  },
});

export { expect };
