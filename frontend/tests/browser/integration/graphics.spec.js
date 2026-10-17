import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { openStudio, saveLayout, reopenLayout } from '../helpers/studio.js';

// No API mocks. Explicit storage authorization and a stable run ID are required.
// A rerun with the same ID reuses its retained asset/layout instead of creating duplicates.
test('live Graphics persists one asset and embedded template through reload and PNG simulation', async ({page, request}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(process.env.E2E_ALLOW_STORAGE_WRITES !== 'true', 'Requires named-target storage authorization.');
  const runId = process.env.E2E_GRAPHICS_RUN_ID;
  test.skip(!runId, 'Set a stable E2E_GRAPHICS_RUN_ID for the retained acceptance fixtures.');
  expect(runId).toMatch(/^[a-z0-9_]{1,64}$/);
  const code = `graphics_${runId}`;
  const name = `Graphics UAT ${runId}`;
  const title = `Graphics Template ${runId}`;
  const forbidden = [];
  const writes = [];
  await page.route('**/api/**', route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET') {
      const allowed = req.method() === 'POST' && ['/api/v1/graphics', '/api/v1/layouts', '/api/v1/simulation/editor-preview'].includes(url.pathname);
      if (!allowed) { forbidden.push({method:req.method(),path:url.pathname}); return route.abort(); }
      writes.push(url.pathname);
    }
    return route.continue();
  });

  await openStudio(page);
  // Live Studio may open an existing layout. Start a new draft without changing it.
  await page.getByTestId('topbar-menu-btn-file').click();
  await page.getByRole('menuitem', {name:'New Template',exact:true}).click();
  await page.getByTestId('input-width-mm').fill('50');
  await page.getByTestId('input-height-mm').fill('25');
  await page.getByTestId('canvas-setup-modal').getByRole('button', {name:'203.2 DPI (8 dpmm)',exact:true}).click();
  await page.getByTestId('btn-apply-dimensions').click();
  await expect(page.getByTestId('canvas-setup-modal')).toHaveCount(0);
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(0)');
  const dataUri = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=96; canvas.height=48;
    const context = canvas.getContext('2d');
    context.fillStyle='#fff'; context.fillRect(0,0,96,48);
    context.fillStyle='#000'; context.fillRect(6,6,84,36);
    context.fillStyle='#fff'; context.fillRect(18,12,12,24); context.fillRect(42,12,36,6);
    return canvas.toDataURL('image/png');
  });
  const png = Buffer.from(dataUri.split(',')[1],'base64');
  const checksum = createHash('sha256').update(png).digest('hex');
  const listed = await request.get('/api/v1/graphics', {params:{q:name}});
  expect(listed.status()).toBe(200);
  const matches = (await listed.json()).filter(item => item.name === name);
  expect(matches.length).toBeLessThanOrEqual(1);
  let asset = matches[0];
  await page.getByTestId('dock-btn-graphics').click();
  if (!asset) {
    const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/graphics' && response.request().method() === 'POST');
    await page.getByTestId('graphics-upload-file').setInputFiles({name:`${name}.png`,mimeType:'image/png',buffer:png});
    const response = await uploaded;
    expect(response.status()).toBe(201);
    asset = await response.json();
  }
  await testInfo.attach('retained-asset', {body:JSON.stringify({runId,asset_id:asset.id,name,sha256:checksum}),contentType:'application/json'});
  await page.getByTestId('graphics-search').fill(name);
  const card = page.getByTestId(`graphics-asset-${asset.id}`);
  await expect(card).toBeVisible();
  await expect.poll(() => card.locator('img').evaluate(image => image.naturalWidth)).toBe(96);
  const original = await request.get(`/api/v1/graphics/${asset.id}/content`);
  expect(original.status()).toBe(200);
  expect(createHash('sha256').update(await original.body()).digest('hex')).toBe(checksum);
  await card.click();
  await expect(page.getByText('Graphic added to the label.', {exact:true})).toBeVisible();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');

  const existing = await request.get(`/api/v1/layouts/${code}`);
  expect([200,404]).toContain(existing.status());
  if (existing.status() === 404) {
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/layouts' && response.request().method() === 'POST');
    await saveLayout(page,code,title);
    expect((await saved).status()).toBe(201);
    await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  }
  const persisted = await request.get(`/api/v1/layouts/${code}`);
  expect(persisted.status()).toBe(200);
  const layout = await persisted.json();
  expect(layout.version).toBe(1);
  expect(layout.svg).toContain(dataUri);
  expect(layout.svg).not.toMatch(/graphicAsset|graphic-asset/);
  const svgChecksum = createHash('sha256').update(layout.svg).digest('hex');
  expect(layout.svg_sha256).toBe(svgChecksum);

  await page.reload();
  await reopenLayout(page,title);
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  const simulated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/simulation/editor-preview' && response.request().method() === 'POST' && response.request().postDataJSON().purpose === 'simulation', {timeout:60_000});
  await page.getByTestId('topbar-menu-btn-utilities').click();
  await page.getByTestId('btn-label-simulation').click();
  await page.getByRole('button', {name:'Run simulation',exact:true}).click();
  const response = await simulated;
  expect(response.status()).toBe(200);
  const result = await response.json();
  const bitmap = Buffer.from(result.png_base64,'base64');
  expect(bitmap.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  await expect(page.getByAltText('Backend bitmap preview of the current Studio canvas')).toBeVisible({timeout:15_000});
  const pixels = await page.getByAltText('Backend bitmap preview of the current Studio canvas').evaluate(image => {
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;let dark=0,light=0;
    for(let i=0;i<rgba.length;i+=4) { if(rgba[i]<128 && rgba[i+3]>0) dark++;else light++; }
    return {dark,light};
  });
  expect(pixels.dark).toBeGreaterThan(100);
  expect(pixels.light).toBeGreaterThan(100);
  expect(forbidden).toEqual([]);
  expect(writes.filter(path=>path==='/api/v1/graphics').length).toBeLessThanOrEqual(1);
  expect(writes.filter(path=>path==='/api/v1/layouts').length).toBeLessThanOrEqual(1);
  const evidence = {runId,asset_id:asset.id,asset_name:name,asset_sha256:checksum,label_code:code,template_version:layout.version,
    template_sha256:svgChecksum,simulation_request_id:result.request_id,simulation_size:[result.width_px,result.height_px],
    simulation_png_sha256:createHash('sha256').update(bitmap).digest('hex'),pixels,forbidden_requests:forbidden,writes};
  await writeFile(testInfo.outputPath('graphics-live-acceptance.json'), JSON.stringify(evidence,null,2) + '\n');
  await writeFile(testInfo.outputPath('graphics-simulation.png'), bitmap);
  await testInfo.attach('graphics-live-acceptance', {body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  await testInfo.attach('graphics-simulation', {body:bitmap,contentType:'image/png'});
  await page.screenshot({path:testInfo.outputPath('graphics-live-simulation.png'),fullPage:true});
  // Retain both fixtures. Never remove existing records or call a printer.
});
