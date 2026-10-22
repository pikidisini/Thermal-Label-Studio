import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {mockBuiltApplication} from '../helpers/studio.js';

async function setup(page) {
  await mockBuiltApplication(page);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/management(?:\?.*)?$/,route => route.fulfill({path:fileURLToPath(new URL('../../../dist/index.html',import.meta.url))}));
  await page.route('**/health',route => route.fulfill({json:{status:'ok'}}));
  await page.route('**/api/v1/layouts',route => route.fulfill({json:[]}));
  const writes = [];
  const audit = Array.from({length:30},(_,index) => ({event_id:`audit-${index}`,at:'2026-10-21T09:00:00Z',action:index === 29 ? 'printer.delete':'template.update',object_id:`LABEL_${index}`,actor:'DEVELOPMENT_UNAUTHENTICATED',revision:'REV1',note:'Synthetic change',before:{label_code:'OLD',same:'unchanged',nested:{enabled:false,zero:0,empty:'',nullable:null}},after:{label_code:'NEW',same:'unchanged',nested:{enabled:true,zero:0,empty:'',added:null}}}));
  const activity = Array.from({length:30},(_,index) => ({trace_id:`trace-${index}`,at:'2026-10-21T09:00:00Z',origin:'intake',source:'SAP_TEST',mode:'print',status:'COMPLETED',status_code:200,duration_ms:19463.5,items:[{item_index:0,label_code:'ROLL',copies:3,target_id:'SAVED_TARGET',status:'SUBMITTED'}],events:[{event:'REQUEST_RECEIVED',at:'2026-10-21T09:00:00Z',elapsed_ms:0},{event:'SUBMITTED',item_index:0,at:'2026-10-21T09:00:01Z',elapsed_ms:1000}]}));
  await page.route('**/api/v1/management/**',route => {
    if (route.request().method() !== 'GET') writes.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({json:{writable:true,policy_origin:'management',document:{policy:{revision:'REV1',sources:[],targets:[],audit:[]},reviews:[]}}});
    if (path.endsWith('/audit')) return route.fulfill({json:audit});
    if (path.endsWith('/activity')) return route.fulfill({json:{enabled:true,entries:activity}});
    return route.fulfill({status:404,json:{}});
  });
  return writes;
}

test('Audit details open immediately, compare changed fields and restore focus and list position',async ({page},testInfo) => {
  const writes = await setup(page);
  await page.goto('/management?section=audit');
  const rows = page.locator('.management-log-table tbody tr');
  await expect(rows).toHaveCount(25);
  const first = rows.first();
  await first.click();
  const drawer = page.getByRole('dialog',{name:'Change details'});
  await expect(drawer).toHaveCSS('animation-name','management-log-slide-in');
  await expect(drawer.getByRole('heading',{name:'Changed fields'})).toBeVisible();
  await expect(rows.first()).toHaveAttribute('data-log-selected','true');
  const diff = drawer.locator('.management-audit-diff tbody');
  await expect(diff.getByRole('row')).toHaveCount(4);
  await expect(diff).toContainText('label_code');
  await expect(diff).not.toContainText('unchanged');
  await expect(diff.getByRole('row').filter({hasText:'nested.added'})).toContainText('Not present');
  await expect(diff.getByRole('row').filter({hasText:'nested.nullable'})).toContainText('null');
  await page.screenshot({path:testInfo.outputPath('audit-drawer.png')});
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(first).toBeFocused();
  await first.press('Enter');
  await expect(drawer).toBeVisible();
  await rows.nth(1).getByRole('cell').first().click();
  await expect(drawer).toContainText('LABEL_1');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected','true');
  await expect(rows.first()).toHaveAttribute('aria-selected','false');
  await expect(page.getByRole('button',{name:'Details',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(rows.nth(1)).toBeFocused();
  await first.press('Space');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('.management-log-table')).toHaveJSProperty('scrollTop',0);
  for (const width of [320,540,1024]) {
    await page.setViewportSize({width,height:900});
    await first.click();
    await expect(drawer.getByRole('button',{name:'Close'})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`audit-drawer-${width}.png`)});
    await drawer.getByRole('button',{name:'Close'}).click();
    await expect(drawer).toHaveCount(0);
  }
  expect(writes).toEqual([]);
});

test('Log drawer respects reduced and zero-duration motion when opening and closing', async ({page}) => {
  await setup(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/management?section=audit');
  await page.locator('.management-log-table tbody tr').first().click();
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name','none');
  await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addStyleTag({content:':root { --ui-panel-slide-duration: 0ms !important; }'});
  await page.locator('.management-log-table tbody tr').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Both log drawers slide out before unmounting on Close and Escape', async ({page}) => {
  await setup(page);
  for (const section of ['audit','activity']) {
    await page.goto(`/management?section=${section}`);
    await page.evaluate(() => {
      window.logExitEvents = [];
      for (const type of ['animationstart','animationend']) document.addEventListener(type,event => {
        if (event.animationName === 'management-log-slide-out') window.logExitEvents.push(type);
      });
    });
    const first = page.locator('.management-log-table tbody tr').first();
    const drawer = page.getByRole('dialog');
    for (const method of ['button','escape']) {
      await first.click();
      await expect(drawer).toBeVisible();
      if (method === 'button') await drawer.getByRole('button',{name:'Close'}).click();
      else await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(first).toBeFocused();
      expect(await page.evaluate(() => window.logExitEvents.splice(0))).toEqual(['animationstart','animationend']);
    }
  }
});

test('Audit filters, pagination, URL restore and no-match state remain local to loaded records',async ({page}) => {
  const writes = await setup(page);
  await page.goto('/management?section=audit');
  await page.getByRole('button',{name:'Next page'}).click();
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(5);
  await page.getByRole('button',{name:'Reset filters'}).click();
  await page.getByLabel('Object type',{exact:true}).selectOption('printer');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL(/audit_object=printer/);
  await page.getByLabel('Search audit').fill('missing');
  await expect(page.getByText('No audit matches these filters.')).toBeVisible();
  await page.getByRole('button',{name:'Reset filters'}).click();
  await page.getByLabel('Rows per page').selectOption('50');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(30);
  await page.getByLabel('From',{exact:true}).fill('2026-10-22T00:00');
  await expect(page.getByText('No audit matches these filters.')).toBeVisible();
  expect(writes).toEqual([]);
});

test('Activity drawer summarizes items, groups stages, copies trace and retains bookmarked filters',async ({page,context},testInfo) => {
  const writes = await setup(page);
  await page.goto('/management?section=activity&activity_source=SAP_TEST&activity_mode=print');
  await expect(page.getByLabel('Activity source')).toHaveValue('SAP_TEST');
  await page.getByRole('button',{name:'Next page'}).click();
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(5);
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('.management-log-table tbody tr').first().getByRole('button',{name:'Copy trace-25',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.management-log-table tbody tr').first().click();
  const drawer = page.getByRole('dialog',{name:'Activity details'});
  await expect(drawer.getByRole('heading',{name:'Request summary'})).toBeVisible();
  await expect(drawer).toContainText('Submitted: 1');
  await expect(drawer).toContainText('COMPLETED describes request processing.');
  await drawer.getByLabel('Group events').selectOption('stage');
  await expect(drawer.getByText('SUBMITTED (1)',{exact:true})).toBeVisible();
  await drawer.getByText('SUBMITTED (1)',{exact:true}).click();
  await expect(drawer.getByText('+1 s',{exact:true})).toBeVisible();
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await drawer.getByRole('button',{name:'Copy trace-25',exact:true}).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('trace-25');
  await page.screenshot({path:testInfo.outputPath('activity-drawer.png')});
  await drawer.getByRole('button',{name:'Close'}).click();
  await page.getByRole('button',{name:'Audit Log',exact:true}).click();
  await page.getByRole('button',{name:'Activity Log',exact:true}).click();
  await expect(page.getByLabel('Activity source')).toHaveValue('SAP_TEST');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(5);
  expect(writes).toEqual([]);
});
