const DESIGN_SAMPLE_DESCRIPTIONS = {
  ZZWIDTH: 'Roll Width', ZZLENGTH: 'Roll Length', ZZTHICKNESS: 'Film Thickness',
  ZZWEIGHT: 'Net Weight', ZZNOMORROLL: 'Roll Number', ZZGRADE: 'Grade',
  ZZINSIDE: 'Inside Treatment', ZZOUTSIDE: 'Outside Treatment', ZZCORE: 'Core Size',
  'ZZSPECIALTOUCH-1': 'Special Touch 1', 'ZZSPECIALTOUCH-2': 'Special Touch 2',
  'ZZSPECIALTOUCH-3': 'Special Touch 3', ZZLABEL: 'Label Code',
  MATNR: 'Material Number', CHARG: 'Batch Number', WERKS: 'Plant',
  EBELN: 'Purchase Order', EBELP: 'Purchase Order Item', MENGE: 'Quantity',
  LGORT: 'Storage Location', MEINS: 'Unit of Measure', NETPR: 'Net Price', WAERS: 'Currency',
  BEDAT: 'Document Date', EINDT: 'Delivery Date', LIFNR: 'Vendor',
  MANDT: 'SAP Client', BUKRS: 'Company Code', EKGRP: 'Purchasing Group',
  TXZ01: 'Description', MATKL: 'Material Group', BRGEW: 'Gross Weight',
  NTGEW: 'Net Weight', GEWEI: 'Weight Unit',
};

export const DESIGN_SAMPLE_PAYLOAD = {
  sender: { system: 'DESIGN_SAMPLE', client: '000', plant: 'SAMPLE' },
  request_id: 'design-sample-001',
  field_descriptions: { ...DESIGN_SAMPLE_DESCRIPTIONS, customer_name: 'Customer Name', material_number: 'Material Number', batch_number: 'Batch Number', production_date: 'Production Date' },
  items: [{ item_id: 'sample-roll-001', label_code: 'SAMPLE_ROLL', copies: 1,
    data: { customer_name: 'Example Customer', material_number: 'FILM-001',
      batch_number: '0000317326', ZZNOMORROLL: 'W CCR 019 901 9C 01 05',
      ZZTHICKNESS: 15, ZZWIDTH: 695, ZZLENGTH: 8000, ZZWEIGHT: 116.76,
      production_date: '2026-10-07', ZZINSIDE: 'SE', ZZOUTSIDE: 'CO' } }],
};

export async function uploadSampleFixture(page) {
  await page.getByTestId('input-local-sap-json').setInputFiles({ name: 'test-sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(DESIGN_SAMPLE_PAYLOAD)) });
}
