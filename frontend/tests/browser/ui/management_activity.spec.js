import { test, expect } from '../helpers/coverage.js';
import { fileURLToPath } from 'node:url';
import { mockBuiltApplication } from '../helpers/studio.js';

const entry = {
  trace_id: '11111111-1111-4111-8111-111111111111', at: '2026-10-13T02:00:00Z', origin: 'intake',
  mode: 'print', source: 'SAP_TEST', external_request_id: 'REQ_TEST', status: 'UNCERTAIN',
  status_code: 200, duration_ms: 123, replayed: false,
  items: [{label_code:'ROLL_TEST',copies:2,status:'UNCERTAIN',confirmed:false,target_id:'P_TEST'}],
  events: [{event:'REQUEST_RECEIVED',at:'2026-10-13T02:00:00Z',elapsed_ms:0},
    {event:'SUBMITTING',at:'2026-10-13T02:00:00Z',elapsed_ms:100,item_index:0},
    {event:'UNCERTAIN',at:'2026-10-13T02:00:00Z',elapsed_ms:120,item_index:0}],
};

async function setup(page, activity) {
  const writes = [];
  await mockBuiltApplication(page);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/management(?:\?.*)?$/, route => route.fulfill({path:fileURLToPath(new URL('../../../dist/index.html',import.meta.url))}));
  await page.route('**/health', route => route.fulfill({json:{status:'ok'}}));
  await page.route('**/api/v1/layouts', route => route.fulfill({json:[]}));
  await page.route('**/api/v1/management/**', route => {
    if (route.request().method() !== 'GET') writes.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({json:{writable:true,policy_origin:'management',document:{policy:{revision:'P1',sources:[],targets:[],audit:[]},reviews:[]}}});
    if (path.endsWith('/audit')) return route.fulfill({json:[]});
    if (path.endsWith('/activity')) return route.fulfill(activity);
    return route.fulfill({status:404,json:{}});
  });
  return writes;
}

test('Activity columns show sender, historical targets and submitted batch counts without counting copies or replay', async ({page}, testInfo) => {
  const cases = [
    { ...entry, trace_id:'mixed', status:'PARTIAL', items:[
      {label_code:'A',status:'SUBMITTED',copies:9,target_id:'OLD_PRINTER'},
      {label_code:'A',status:'SUBMITTED',copies:3,target_id:'OLD_PRINTER'},
      {label_code:'B',status:'UNCERTAIN',target_id:'SECOND_PRINTER'},
      {label_code:'C',status:'FAILED',target_id:'SECOND_PRINTER'},
      {label_code:'D',status:'SKIPPED'},
    ]},
    {...entry,trace_id:'replay',replayed:true,items:[{status:'SUBMITTED',target_id:'OLD_PRINTER'}]},
    {...entry,trace_id:'label-print',origin:'label_print',source:undefined,target_id:'LAN',items:[{status:'SUBMITTED'},{status:'NOT_ATTEMPTED'}]},
    {...entry,trace_id:'preview',origin:'studio',source:undefined,mode:'preview',items:undefined},
    {...entry,trace_id:'legacy',origin:'studio',source:undefined,target:{host:'192.0.2.1',port:9100},items:undefined},
    {...entry,trace_id:'summary',items:undefined,summary:{submitted:4}},
  ];
  const writes = await setup(page,{json:{enabled:true,entries:cases}});
  await page.goto('/management?section=activity');
  for (const name of ['Sender','Target printer','Batch count']) {
    await expect(page.getByRole('columnheader',{name,exact:true})).toBeVisible();
  }
  const expected = [
    ['API Intake','SAP_TEST','OLD_PRINTER, SECOND_PRINTER','2'],
    ['API Intake','SAP_TEST','OLD_PRINTER','0'],
    ['Label Print','—','LAN','1'],
    ['Studio','—','—','0'],
    ['Studio','—','192.0.2.1:9100','—'],
    ['API Intake','SAP_TEST','—','4'],
  ];
  const rows = page.locator('.management-activity-table tbody tr');
  await expect(rows).toHaveCount(expected.length);
  for (let i=0; i<expected.length; i++) {
    for (let column=0; column<4; column++) {
      await expect(rows.nth(i).getByRole('cell').nth(column+1)).toHaveText(expected[i][column]);
    }
  }
  await expect(page.getByText('Batch count is the number of submitted items', {exact:false})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('activity-columns.png')});
  expect(writes).toEqual([]);
});

test('Activity Log filters and reveals safe stages without requests to printers', async ({page},testInfo) => {
  const writes = await setup(page,{json:{enabled:true,entries:[entry,{...entry,trace_id:'22222222-2222-4222-8222-222222222222',origin:'studio',source:undefined,mode:'simulation',operation:'preview',status:'SIMULATED',items:[]}]}});
  await page.goto('/management?section=activity');
  await expect(page.getByRole('heading',{name:'Activity Log',exact:true})).toBeVisible();
  await page.getByLabel('Search activity').fill('ROLL_TEST');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(1);
  await page.locator('.management-log-table tbody tr').click();
  await expect(page.getByRole('heading',{name:'Activity details'})).toBeVisible();
  await page.getByRole('dialog').getByText('Item 1 (2)',{exact:true}).click();
  await expect(page.getByText('SUBMITTING',{exact:true})).toBeVisible();
  await page.getByRole('dialog').getByText('Request metadata',{exact:true}).click();
  await expect(page.getByText('"confirmed": false',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByLabel('Search activity').fill('');
  await page.getByLabel('Modes filter').selectOption('simulation');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Activity status').selectOption('UNCERTAIN');
  await expect(page.getByText('No activity matches these filters.')).toBeVisible();
  await page.getByLabel('Modes filter').selectOption('');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(1);
  await page.getByLabel('From',{exact:true}).fill('2026-10-14T00:00');
  await expect(page.getByText('No activity matches these filters.')).toBeVisible();
  await page.getByLabel('From',{exact:true}).fill('');
  await page.screenshot({path:testInfo.outputPath('activity-log.png')});
  expect(writes).toEqual([]);
});

test('Activity Log shows disabled storage and isolates load errors from configuration', async ({page}) => {
  const writes = await setup(page,{json:{enabled:false,entries:[]}});
  await page.goto('/management?section=activity');
  await expect(page.getByText('Activity recording is disabled.',{exact:false})).toBeVisible();
  await page.route('**/api/v1/management/activity', route => route.fulfill({status:503,json:{detail:{code:'activity_unavailable',message:'Activity storage is unavailable. Check provisioning and server configuration.'}}}));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Activity storage is unavailable.');
  await page.getByRole('button',{name:'Printers',exact:true}).click();
  await expect(page.getByRole('button',{name:'Add printer',exact:true})).toBeEnabled();
  expect(writes).toEqual([]);
});


test('Activity Log identifies Label Print and filters preview and printer status records', async ({page}) => {
  const preview = {...entry, source:undefined, external_request_id:undefined, origin:'label_print', mode:'preview', operation:'preview', status:'FAILED', status_code:429, error_code:'preview_busy',items:[]};
  const status = {...preview,trace_id:'33333333-3333-4333-8333-333333333333',mode:'status',operation:'printer_status',status:'CHECKED',status_code:200,error_code:undefined,printer_state:'ATTENTION',printer_reason:'media_out'};
  const writes = await setup(page,{json:{enabled:true,entries:[preview,status]}});
  await page.goto('/management?section=activity');
  await expect(page.getByRole('cell',{name:'Label Print',exact:true})).toHaveCount(2);
  await page.getByLabel('Modes filter').selectOption('preview');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(1);
  await page.locator('.management-log-table tbody tr').click();
  await page.getByRole('dialog').getByText('Request metadata',{exact:true}).click();
  await expect(page.locator('.management-activity-metadata')).toContainText('preview_busy');
  await expect(page.locator('.management-activity-metadata')).toContainText('429');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Modes filter').selectOption('status');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(1);
  await page.locator('.management-log-table tbody tr').click();
  await page.getByRole('dialog').getByText('Request metadata',{exact:true}).click();
  await expect(page.locator('.management-activity-metadata')).toContainText('media_out');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Modes filter').selectOption('');
  await page.getByLabel('Search activity').fill('label_print');
  await expect(page.locator('.management-log-table tbody tr')).toHaveCount(2);
  expect(writes).toEqual([]);
});
