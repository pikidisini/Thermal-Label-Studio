import { test, expect } from '@playwright/test';
import { mockBuiltApplication, openStudio, saveLayout, reopenLayout } from '../helpers/studio.js';

test.beforeEach(async ({page}) => { await mockBuiltApplication(page); await openStudio(page); });

async function library(page, initial = []) {
  const items = [...initial];
  const writes = [];
  await page.route('**/api/v1/graphics**', async route => {
    const request = route.request(); const url = new URL(request.url());
    const id = url.pathname.split('/')[4];
    if (request.method() === 'POST') {
      const value = request.postDataJSON(); writes.push(value);
      const asset = { ...value, id: `00000000-0000-4000-8000-${String(items.length + 1).padStart(12, '0')}`, version: 1, content_type: value.data_uri.split(';')[0].slice(5) };
      items.unshift(asset); return route.fulfill({status:201,json:asset});
    }
    if (id) {
      const item = items.find(item => item.id === id);
      if (!item) return route.fulfill({status:404,json:{detail:{message:'The graphic was not found.'}}});
      if (url.pathname.endsWith('/content')) return route.fulfill({contentType:item.content_type, body:Buffer.from(item.data_uri.split(',')[1], 'base64')});
      return route.fulfill({json:item});
    }
    const q = (url.searchParams.get('q') || '').toLowerCase(); const offset = Number(url.searchParams.get('offset') || 0);
    return route.fulfill({json:items.filter(item => item.name.toLowerCase().includes(q)).slice(offset, offset + 100).map(({data_uri,...summary}) => summary)});
  });
  return {items,writes};
}

async function files(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=8; canvas.height=4;
    canvas.getContext('2d').fillRect(0,0,8,4);
    return ['image/png','image/jpeg','image/webp'].map(type => ({type,uri:canvas.toDataURL(type)}));
  });
}

test('library uploads all raster formats, searches and embeds independent copies that save and reopen', async ({page}, testInfo) => {
  const {items,writes} = await library(page); let stored;
  await page.route('**/api/v1/layouts', route => {
    if (route.request().method() === 'POST') {
      stored = {...route.request().postDataJSON(),version:1,status:'published',svg_sha256:'0'.repeat(64),object_key:'mock.svg',created_at:'2026-10-17T00:00:00Z'};
      return route.fulfill({status:201,json:stored});
    }
    return route.fulfill({json:stored?[stored]:[]});
  });
  await page.route('**/api/v1/layouts/graphics_audit', route => route.fulfill({json:stored}));
  const images = await files(page);
  await page.getByTestId('dock-btn-graphics').click();
  await expect(page.getByText('No graphics found. Upload a PNG, JPEG or WebP image.')).toBeVisible();
  for (const image of images) {
    await page.getByTestId('graphics-upload-file').setInputFiles({name:`Logo.${image.type.split('/')[1]}`,mimeType:image.type,buffer:Buffer.from(image.uri.split(',')[1],'base64')});
    await expect(page.getByText('Graphic uploaded. Add it to the label from the library.', {exact:true})).toBeVisible();
    await expect(page.getByTestId('graphics-upload-file')).toHaveValue('');
  }
  expect(writes).toHaveLength(3);
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(3);
  await page.screenshot({path:testInfo.outputPath('graphics-library.png')});
  await page.getByTestId('graphics-search').fill('Logo');
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(3);
  await page.getByTestId('graphics-search').fill('missing');
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(0);
  await page.getByTestId('graphics-search').fill('');
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(3);
  for (const asset of items) {
    await page.getByTestId(`graphics-asset-${asset.id}`).click();
    await expect(page.getByText('Graphic added to the label.',{exact:true})).toBeVisible();
  }
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(3)');
  await saveLayout(page,'graphics_audit','Graphics Audit');
  await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  for (const image of images) expect(stored.svg).toContain(image.uri);
  expect(stored.svg).not.toMatch(/graphicAsset|graphic-asset/);
  // Removal from the mock library cannot change the saved embedded image bytes.
  items.splice(0);
  await reopenLayout(page,'Graphics Audit');
  await expect(page.getByTestId('layers-count-label')).toContainText('(3)');
});

test('invalid upload never posts; storage and upload failures stay visible without changing layers', async ({page}) => {
  let posts=0;
  await page.route('**/api/v1/graphics**', route => {
    if (route.request().method() === 'POST') { posts++; return route.fulfill({status:422,json:{detail:{message:'Choose a valid single-frame PNG, JPEG or WebP within the image limits.'}}}); }
    return route.fulfill({status:503,json:{detail:{message:'Graphics storage is unavailable. Contact the application administrator.'}}});
  });
  await page.getByTestId('dock-btn-graphics').click();
  await expect(page.getByRole('alert')).toContainText('Graphics storage is unavailable.');
  await page.getByTestId('graphics-upload-file').setInputFiles({name:'logo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await expect(page.getByRole('alert')).toContainText('Unsupported image format.');
  expect(posts).toBe(0);
  const png = (await files(page))[0];
  for (let attempt=0;attempt<2;attempt++) {
    await page.getByTestId('graphics-upload-file').setInputFiles({name:'logo.png',mimeType:png.type,buffer:Buffer.from(png.uri.split(',')[1],'base64')});
    await expect(page.getByRole('alert')).toContainText('Choose a valid single-frame');
    await expect(page.getByTestId('graphics-upload-file')).toHaveValue('');
  }
  expect(posts).toBe(2);
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(0)');
});

test('pagination and server search include assets beyond the first page', async ({page}) => {
  const png=(await files(page))[0];
  const initial=Array.from({length:101},(_,index)=>({id:`g${index}`,name:index===100?'Last Logo':'Logo '+index,data_uri:png.uri,content_type:png.type,version:1}));
  await library(page,initial);
  await page.getByTestId('dock-btn-graphics').click();
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(100);
  await page.getByRole('button',{name:'Load more',exact:true}).click();
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(101);
  await page.getByTestId('graphics-search').fill('Last Logo');
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(1);
  await expect(page.getByTestId('graphics-asset-g100')).toBeVisible();
});

test('invalid asset source is rejected without fetching a remote image or adding a layer', async ({page}) => {
  const png=(await files(page))[0];
  await library(page,[{id:'bad',name:'Broken',data_uri:png.uri,content_type:png.type,version:1}]);
  await page.route('**/api/v1/graphics/bad',route => route.fulfill({json:{id:'bad',name:'Broken',data_uri:'https://example.com/remote.png'}}));
  const remote=[];
  await page.route('https://example.com/**',route => {remote.push(route.request().url());return route.abort();});
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('dock-btn-graphics').click();
  await page.getByTestId('graphics-asset-bad').click();
  await expect(page.getByRole('alert')).toContainText('Invalid graphic response.');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  expect(remote).toEqual([]);
});
