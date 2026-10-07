import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

async function loadConfig(value, suffix) {
  const previous = process.env.E2E_BASE_URL;
  const previousRun = process.env.TLS_PLAYWRIGHT_RUN_ID;
  delete process.env.TLS_PLAYWRIGHT_RUN_ID;
  try {
    if (value === undefined) delete process.env.E2E_BASE_URL;
    else process.env.E2E_BASE_URL = value;
    return (await import(`../playwright.config.js?case=${suffix}`)).default;
  } finally {
    if (previousRun === undefined) delete process.env.TLS_PLAYWRIGHT_RUN_ID;
    else process.env.TLS_PLAYWRIGHT_RUN_ID = previousRun;
    if (previous === undefined) delete process.env.E2E_BASE_URL;
    else process.env.E2E_BASE_URL = previous;
  }
}

test('browser config never starts servers or seeds legacy auth', async () => {
  const config = await loadConfig(undefined, 'default');
  assert.equal(config.webServer, undefined);
  assert.equal(config.globalSetup, undefined);
  assert.equal(config.use.baseURL, 'http://127.0.0.1:8002');
  assert.deepEqual(config.use.storageState, { cookies: [], origins: [] });
  assert.deepEqual(config.projects.map(project => project.name), ['ui', 'integration']);
  assert.equal(config.testDir, './tests/browser');
});

test('browser target rejects remote origins, credentials and paths', async () => {
  let index = 0;
  for (const value of ['http://example.com', 'http://user:secret@127.0.0.1:8002', 'http://127.0.0.1:8002/studio', 'http://127.0.0.1:8002?token=x']) {
    await assert.rejects(loadConfig(value, `invalid-${index++}`));
  }
  const config = await loadConfig('http://127.0.0.1:8003', 'local-port');
  assert.equal(config.use.baseURL, 'http://127.0.0.1:8003');
});

test('storage-write browser test requires explicit opt-in', async () => {
  const source = await readFile(new URL('./browser/integration/studio.spec.js', import.meta.url), 'utf8');
  assert.match(source, /test\.skip\(process\.env\.E2E_ALLOW_STORAGE_WRITES !== 'true'/);
  assert.ok(source.indexOf('test.skip(') < source.indexOf('await saveLayout('));
});

test('browser reports and artifacts use a unique project .tmp child', async () => {
  const first = await loadConfig(undefined, 'outputs-one');
  const second = await loadConfig(undefined, 'outputs-two');
  assert.notEqual(first.outputDir, second.outputDir);
  const reportDir = first.reporter.find(([kind]) => kind === 'html')[1].outputFolder;
  assert.equal(path.dirname(reportDir), path.dirname(first.outputDir));
  assert.equal(path.basename(path.dirname(path.dirname(first.outputDir))), '.tmp');
});
