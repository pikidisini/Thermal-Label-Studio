import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '../helpers/coverage.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist=fileURLToPath(new URL('../../../dist/',import.meta.url));

for(const lang of ['en','id']) test(`SAP Get Data uses selected RFC and preserves batch identity in ${lang}`,async({page},testInfo)=>{
 const id=lang==='id';const requests=[];let png;let runtime=true;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/v1/auth/'))return route.fallback();
  if(url.pathname==='/api/v1/label-print/printers')return route.fulfill({json:{policy_origin:'management',printers:[]}});
  if(url.pathname==='/api/v1/label-print/operations')return route.fulfill({json:{revision:'RFC-R1',runtime_available:runtime,operations:[{operation_id:'ROLL',name:'Roll RFC',enabled:true,response_mode:'label_json',parameters:[{name:'IV_CHARG',label:'Batch',kind:'string',source:'operator',required:true}]}]}});
  if(url.pathname==='/api/v1/label-print/preview'){
   const body=route.request().postDataJSON();requests.push(body);
   return route.fulfill({json:{source:'sap',encoder:'IPL',operation_id:'ROLL',operation_revision:'RFC-R1',items:body.batches.map((batch,index)=>({index,batch,status:batch==='UNKNOWN'?'FAILED':'PREVIEWED',label_code:'SAP_LABEL',template_version:'4',template_sha256:'a'.repeat(64),payload_sha256:'b'.repeat(64),width_px:640,height_px:480,dpi:203.2,png_base64:batch==='UNKNOWN'?null:png,error_code:batch==='UNKNOWN'?'sap_status_failed':null}))}});
  }
  if(url.hostname!=='127.0.0.1')return route.abort();
  if(url.pathname==='/print')return route.fulfill({path:path.join(dist,'index.html'),contentType:'text/html'});
  if(url.pathname.startsWith('/assets/')){const file=path.resolve(dist,`.${url.pathname}`);if(file.startsWith(path.join(dist,'assets')+path.sep))return route.fulfill({path:file});}
  return route.abort();
 });
 await page.addInitScript(language=>localStorage.setItem('thermal-label-studio.preferences.v1',JSON.stringify({language,theme:'industrial-dark'})),lang);
 await page.goto('/print');png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;return c.toDataURL().split(',')[1];});
 const inputs=page.locator('.batch-entry input');await inputs.first().fill('0010245801');await inputs.nth(1).fill('UNKNOWN');
 const getData=page.getByRole('button',{name:id?'Ambil Data':'Get Data',exact:true});
 await getData.click(); await page.locator('#print-settings-tab-printer').click();expect(requests).toEqual([]);
 const load=page.getByRole('button',{name:id?'Muat operasi RFC terkonfigurasi':'Load configured RFC operations',exact:true});
 // Use the visible picker action without depending on a preexisting translation.
 await page.locator('#print-settings-tab-source').click();
 await page.locator('button').filter({hasText:/Load configured RFC operations|Muat.*RFC/}).first().click();
 await page.getByLabel(id?'Operasi RFC':'RFC operation',{exact:true}).selectOption('ROLL');
 const sourceBounds=await page.getByRole('combobox', { name: id?'Sumber data':'Data source', exact: true }).boundingBox();
 const operationBounds=await page.getByLabel(id?'Operasi RFC':'RFC operation',{exact:true}).boundingBox();
 expect(operationBounds.y).toBeGreaterThan(sourceBounds.y);
 expect(sourceBounds.height).toBe(24);
 await page.screenshot({path:testInfo.outputPath(`sap-toolbar-${lang}.png`),fullPage:true});
 await getData.click(); await page.locator('#print-settings-tab-printer').click();await expect(page.locator('.label-print-gallery img')).toHaveCount(1);
 expect(requests[0]).toEqual({source:'sap',encoder:'IPL',operation_id:'ROLL',revision:'RFC-R1',batch_parameter:'IV_CHARG',batches:['0010245801','UNKNOWN']});
 await page.locator('.label-print-thumbnail').first().click(); await page.locator('#label-inspector-tab-detail').click();await expect(page.locator('.label-print-card').first()).toContainText('SAP_LABEL');await expect(page.locator('#label-inspector-panel-detail')).toContainText('RFC-R1');
 await expect(page.getByRole('button',{name:id?'Cetak':'Print',exact:true})).toBeDisabled();
 await page.locator('#print-settings-tab-source').click();
 runtime=false;await page.locator('button').filter({hasText:/Load configured RFC operations|Muat.*RFC/}).first().click();await page.getByLabel(id?'Operasi RFC':'RFC operation',{exact:true}).selectOption('ROLL');
 await getData.click(); await page.locator('#print-settings-tab-printer').click();expect(requests).toHaveLength(1);await expect(page.locator('.label-print-card')).toHaveCount(0);
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
