import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
for (const lang of ['en', 'id']) test(`printer status is explicit and scoped to selected LAN printer in ${lang}`, async ({ page }) => {
  const id = lang === 'id'; let checks = 0; let mode = 'responding'; let delayed;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/v1/auth/')) return route.fallback();
    if (url.pathname === '/api/v1/label-print/printers') return route.fulfill({ json: { policy_origin:'management', printers:['LAN','OTHER'].map(target_id => ({target_id, host:'192.0.2.44',port:9100,enabled:true,language:'IPL',connection:'Ethernet',transport:'TCP/RAW'})) } });
    if (url.pathname === '/api/v1/label-print/printer-status') {
      checks++; const body = route.request().postDataJSON();
      expect(body).toEqual({target_id:'LAN',expected_host:'192.0.2.44',expected_port:9100});
      if (mode === 'busy') return route.fulfill({status:429,json:{}});
      if (mode === 'delayed') await new Promise(resolve => { delayed = resolve; });
      const states = {responding:['RESPONDING','ready_or_printing'],attention:['ATTENTION','media_out'],unreachable:['UNREACHABLE','connection_failed'],unavailable:['UNAVAILABLE','no_status_response'],delayed:['ATTENTION','media_out'],invalid:['RESPONDING','media_out']};
      const [state,reason] = states[mode];
      return route.fulfill({json:{target_id:body.target_id,host:body.expected_host,port:body.expected_port,state,reason,checked_at:'2026-10-16T03:00:00+00:00',method:'IPL_ENQ',confirmed:false}}).catch(() => {});
    }
    if (url.pathname.startsWith('/api/') || url.port === '18191') throw new Error('Unexpected device/API request during status check');
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/print') return route.fulfill({path:path.join(dist,'index.html'),contentType:'text/html'});
    if (url.pathname.startsWith('/assets/')) { const file = path.resolve(dist, `.${url.pathname}`); if(file.startsWith(path.join(dist,'assets')+path.sep)) return route.fulfill({path:file}); }
    return route.abort();
  });
  await page.addInitScript(language => localStorage.setItem('thermal-label-studio.preferences.v1',JSON.stringify({language})),lang);
  await page.goto('/print');
  await expect(page.getByRole('button',{name:id?'Periksa status':'Check status',exact:true})).toHaveCount(0);
 await page.locator('#print-settings-tab-printer').click();
  await page.getByRole('combobox', { name: 'Printer', exact: true }).selectOption('LAN');
  const panel = page.getByRole('region',{name:id?'Status printer':'Printer status',exact:true});
  await expect(panel).toContainText(id?'Belum diperiksa':'Not checked'); expect(checks).toBe(0);
  const check = panel.getByRole('button',{name:id?'Periksa status':'Check status',exact:true});
  await check.click();
  await expect(panel).toContainText(id?'siap atau sedang mencetak':'ready or printing');
  await expect(panel.locator('time')).toHaveAttribute('datetime','2026-10-16T03:00:00+00:00');
  for (const [next,text] of [['attention',id?'Label printer habis.':'Printer is out of labels.'],['unreachable',id?'Tidak dapat dihubungi':'Cannot connect'],['unavailable',id?'Status tidak tersedia':'Status unavailable'],['busy',id?'Server sedang mencetak':'Server is busy printing'],['invalid',id?'Status printer tidak dapat diperiksa.':'Printer status could not be checked.']]) {
    mode=next; await check.click(); await expect(panel).toContainText(text); await expect(check).toBeEnabled();
  }
  mode='delayed'; await check.click(); await expect(check).toBeDisabled(); await expect.poll(() => Boolean(delayed)).toBe(true);
 await page.locator('#print-settings-tab-printer').click();
  await page.getByRole('combobox', { name: 'Printer', exact: true }).selectOption('OTHER');
  await expect(panel).toContainText(id?'Belum diperiksa':'Not checked');
  delayed(); await expect(panel.locator('time')).toHaveCount(0);
  await page.getByLabel(id?'Mode demonstrasi':'Demo mode',{exact:true}).check();
  await expect(page.getByRole('button',{name:id?'Periksa status':'Check status',exact:true})).toHaveCount(0);
  expect(checks).toBe(7);
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
