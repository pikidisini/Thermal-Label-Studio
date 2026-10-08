import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePayloadTemplate } from '../src/features/barcode/model/barcodePayload.ts';

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


import { bindingErrors } from '../src/features/data-tokens/model/bindingValidation.ts';
import { parseComposition, compileComposition } from '../src/features/data-tokens/model/composition.ts';
import { getFieldLabel, getFieldStatus } from '../src/features/data-tokens/model/fieldPresentation.ts';

test('field composition preserves literal spacing and exact dynamic keys', () => {
  const template = '{{ZZTHICKNESS}} micron × {{ZZWIDTH}} mm';
  assert.equal(compileComposition(parseComposition(template)), template);
  assert.equal(resolvePayloadTemplate(template, { ZZTHICKNESS: 15, ZZWIDTH: 695 }, 'text').value, '15 micron × 695 mm');
  assert.equal(resolvePayloadTemplate('{{zero}}/{{flag}}', { zero: 0, flag: false }, 'text').value, '0/false');
  assert.equal(resolvePayloadTemplate('{{width}}', { WIDTH: 695 }, 'text').value, null);
  assert.equal(getFieldLabel('ZZWIDTH'), 'ZZWIDTH');
  assert.equal(getFieldLabel('XYZNEW'), 'XYZNEW');
  assert.equal(getFieldStatus(undefined), 'Not supplied');
  assert.equal(getFieldStatus(null), 'Null value');
  assert.equal(getFieldStatus(''), 'Empty value');
});

test('preview rejects absent data and invalid barcode inside groups despite overrides', () => {
  const group = { getObjects: () => [{ dataField: 'ZZWIDTH', previewOverride: true, text: '695' }] };
  assert.ok(bindingErrors([group], {}).length);
  assert.deepEqual(bindingErrors([group], { ZZWIDTH: 0 }), []);
  assert.ok(bindingErrors([{ isBarcode: true, barcodeType: 'ean13', dataBarcode: 'code' }], { code: '123' }).length);
  assert.ok(bindingErrors([{ payloadTemplate: '{{ZZWIDTH}} mm' }], { ZZWIDTH: null }).length);
  assert.deepEqual(bindingErrors([{ payloadTemplate: '{{ZZWIDTH}} mm' }], { ZZWIDTH: 695 }), []);
});


test('SAP descriptions change presentation without changing exact binding or values', () => {
  const labels = { ZZWIDTH: 'WIDTH', ZZWIDTH_ALT: 'WIDTH', blank: '  ' };
  assert.equal(getFieldLabel('ZZWIDTH', { ZZWIDTH: 'WIDTH' }), 'WIDTH');
  assert.equal(getFieldLabel('ZZWIDTH', labels), 'WIDTH (ZZWIDTH)');
  assert.equal(getFieldLabel('ZZWIDTH_ALT', labels), 'WIDTH (ZZWIDTH_ALT)');
  assert.equal(getFieldLabel('blank', labels), 'blank');
  assert.equal(getFieldLabel('unknown', labels), 'unknown');
  assert.equal(resolvePayloadTemplate('{{ZZWIDTH}} mm', { ZZWIDTH: 695 }, 'text', labels).value, '695 mm');
  assert.equal(resolvePayloadTemplate('{{WIDTH}}', { ZZWIDTH: 695 }, 'text', labels).value, null);
  assert.deepEqual(bindingErrors([{ dataField: 'ZZWIDTH' }], {}, { ZZWIDTH: 'WIDTH' }), ['WIDTH has no data.']);
});
