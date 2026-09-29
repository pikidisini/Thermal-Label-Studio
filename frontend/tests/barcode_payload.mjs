import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePayloadTemplate } from '../src/utils/barcodePayload.ts';

test('payload resolver composes literal and tokens', () => {
  const result = resolvePayloadTemplate('batch : {{batch}}\nroll : {{roll}}', { batch: 'B1', roll: 'R2' }, 'qrcode');
  assert.equal(result.error, null);
  assert.equal(result.value, 'batch : B1\nroll : R2');
});

test('payload resolver rejects partial and missing tokens', () => {
  assert.ok(resolvePayloadTemplate('batch : {{', { batch: 'B1' }, 'qrcode').error);
  assert.ok(resolvePayloadTemplate('{{missing}}', {}, 'qrcode').error);
});

test('empty payload stays invalid instead of falling back to old preview', () => {
  const result = resolvePayloadTemplate('', { batch: 'B1' }, 'qrcode');
  assert.ok(result.error);
  assert.equal(result.value, null);
});

test('composite payload resolves again when token values change', () => {
  const before = resolvePayloadTemplate('B={{batch}}', { batch: 'B1' }, 'code128');
  const after = resolvePayloadTemplate('B={{batch}}', { batch: 'B2' }, 'code128');
  assert.equal(before.value, 'B=B1');
  assert.equal(after.value, 'B=B2');
});

test('payload resolver rejects newline for one dimensional barcode', () => {
  assert.ok(resolvePayloadTemplate('{{batch}}\n{{roll}}', { batch: 'B1', roll: 'R2' }, 'code128').error);
});
