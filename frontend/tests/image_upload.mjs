import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageFile, validateImageSignature, imagePlacement, validateImageBudget, MAX_SVG_BYTES } from '../src/features/images/model/imageUpload.ts';
import { translate } from '../src/shared/i18n/index.ts';

test('upload errors have Indonesian translations and preserve English defaults', () => {
  for (const message of ['Unsupported image format. Choose PNG, JPEG or WebP.', 'Image is too large for this template. Use a smaller image.', 'Image could not be read. Choose a valid PNG, JPEG or WebP file.']) {
    assert.equal(translate(message,'en'),message);
    assert.notEqual(translate(message,'id'),message);
  }
});

test('upload admits only bounded nonempty PNG/JPEG/WebP and verifies signatures', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) validateImageFile({type, size: 100});
  for (const type of ['image/svg+xml', 'image/gif', 'image/bmp', '']) assert.throws(() => validateImageFile({type, size: 100}), /Unsupported/);
  for (const size of [0, 400000]) assert.throws(() => validateImageFile({type: 'image/png', size}));
  validateImageSignature(Uint8Array.from([255,216,255]), 'image/jpeg');
  validateImageSignature(Uint8Array.from([137,80,78,71,13,10,26,10]), 'image/png');
  validateImageSignature(Uint8Array.from([82,73,70,70,0,0,0,0,87,69,66,80]), 'image/webp');
  assert.throws(() => validateImageSignature(Uint8Array.from([255,216,255]), 'image/png'), /could not be read/);
});

test('every aspect ratio fits half the canvas, upscaling tiny images and downscaling large ones', () => {
  for (const [width,height] of [[1,1],[2000,1000],[100,2000]]) for (const [cw,ch] of [[20,10],[320,160],[800,1200]]) {
    const result = imagePlacement(width,height,cw,ch);
    assert.equal(result.scaleX,result.scaleY);
    assert.ok(width*result.scaleX <= cw*0.5+1e-9);
    assert.ok(height*result.scaleY <= ch*0.5+1e-9);
    assert.ok(Math.abs(Math.max(width*result.scaleX/cw,height*result.scaleY/ch)-0.5)<1e-9);
    assert.equal(result.left,cw/2); assert.equal(result.top,ch/2);
  }
  for (const dimensions of [[4097,1],[2001,2000],[0,10],[NaN,10]]) assert.throws(() => imagePlacement(...dimensions,320,160));
});

test('document budget counts UTF8 bytes, candidate markup and aggregate decoded pixels', () => {
  validateImageBudget('<svg/>','x',0,4_000_000);
  assert.throws(() => validateImageBudget('a'.repeat(MAX_SVG_BYTES),'x',0,1));
  assert.throws(() => validateImageBudget('é'.repeat(MAX_SVG_BYTES/2),'x',0,1));
  assert.throws(() => validateImageBudget('<svg/>','x',3_000_000,1_000_001));
  assert.throws(() => validateImageBudget('','x',0,1));
});
