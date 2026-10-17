import { test, expect } from '@playwright/test';
import { mockBuiltApplication, openStudio, saveLayout, reopenLayout } from '../helpers/studio.js';

test.beforeEach(async ({page}) => { await mockBuiltApplication(page); await openStudio(page); });

test('PNG/JPEG/WebP uploads resize to the canvas, persist through SVG and can be uploaded again', async ({page}) => {
  let stored;
  await page.route('**/api/v1/layouts', route => {
    if (route.request().method() === 'POST') {
      stored = {...route.request().postDataJSON(), version:1, status:'published', svg_sha256:'0'.repeat(64), object_key:'mock.svg', created_at:'2026-10-17T00:00:00Z'};
      return route.fulfill({status:201,json:stored});
    }
    return route.fulfill({json:stored?[stored]:[]});
  });
  await page.route('**/api/v1/layouts/image_audit',route => route.fulfill({json:stored}));
  const files = await page.evaluate(() => {
    const canvas=document.createElement('canvas'); canvas.width=8;canvas.height=4;
    canvas.getContext('2d').fillRect(0,0,8,4);
    return ['image/png','image/jpeg','image/webp'].map(type=>({type,base64:canvas.toDataURL(type).split(',')[1]}));
  });
  for (const [index,file] of files.entries()) {
    await page.getByTestId('input-upload-image-file').setInputFiles({name:'logo.'+file.type.split('/')[1],mimeType:file.type,buffer:Buffer.from(file.base64,'base64')});
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.getByTestId('layers-count-label')).toContainText(`(${index+1})`);
  }
  await saveLayout(page,'image_audit','Image Audit');
  await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  for (const file of files) expect(stored.svg).toContain('data:'+file.type+';base64,');
  const geometry = await page.evaluate(svg => {
    const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
    const [,,w,h]=root.getAttribute('viewBox').split(' ').map(Number);
    const image=root.querySelector('image');
    const matrix=image.parentElement.getAttribute('transform').match(/matrix\(([^)]+)\)/)[1].trim().split(/[ ,]+/).map(Number);
    return {ratio:Math.max(Math.abs(matrix[0])*8/w,Math.abs(matrix[3])*4/h)};
  },stored.svg);
  expect(geometry.ratio).toBeCloseTo(0.5,3);
  await reopenLayout(page,'Image Audit');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(3)');
  await page.getByTestId('input-upload-image-file').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(files[0].base64,'base64')});
  await expect(page.getByTestId('layers-count-label')).toContainText('(4)');
});

test('unsupported, corrupt and oversized images show an error without changing layers or selection', async ({page}) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('inspector-tab-btn-layers').click();
  const cases=[
    {name:'logo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>'),message:'Unsupported image format'},
    {name:'broken.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0]),message:'Image could not be read'},
    {name:'empty.png',mimeType:'image/png',buffer:Buffer.alloc(0),message:'Image could not be read'},
    {name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(400000),message:'Image is too large'},
  ];
  for (const {message,...file} of cases) {
    const dialog=page.waitForEvent('dialog').then(async alert => { const message=alert.message(); await alert.dismiss(); return message; });
    await page.getByTestId('input-upload-image-file').setInputFiles(file);
    expect(await dialog).toContain(message);
    await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
    await expect(page.getByTestId('input-upload-image-file')).toHaveValue('');
  }
  expect(errors).toEqual([]);
});

test('decoded dimensions and the combined SVG budget reject images before adding a layer', async ({page}) => {
  const images=await page.evaluate(() => {
    const make=(width,height,noise=false)=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');
      if (noise) {
        const pixels=context.createImageData(width,height);let seed=123456;
        for (let i=0;i<pixels.data.length;i+=4) {
          for (let channel=0;channel<3;channel++) {seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels.data[i+channel]=seed&255;}
          pixels.data[i+3]=255;
        }
        context.putImageData(pixels,0,0);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return {wide:make(4097,1),pixels:make(2001,2000),noise:make(280,280,true)};
  });
  await page.getByTestId('inspector-tab-btn-layers').click();
  const upload=base64=>page.getByTestId('input-upload-image-file').setInputFiles({name:'limits.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')});
  for (const image of [images.wide,images.pixels]) {
    const dialog=page.waitForEvent('dialog').then(async alert => { const message=alert.message(); await alert.dismiss(); return message; });await upload(image);
    expect(await dialog).toContain('Image is too large');
    await expect(page.getByTestId('layers-count-label')).toContainText('(0)');
  }
  await upload(images.noise);
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  const dialog=page.waitForEvent('dialog').then(async alert => { const message=alert.message(); await alert.dismiss(); return message; });await upload(images.noise);
  expect(await dialog).toContain('Image is too large');
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
});
