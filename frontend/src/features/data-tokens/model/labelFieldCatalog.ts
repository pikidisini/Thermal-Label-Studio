/** Mirrors docs/examples/label_data.sample.json. Parity is enforced by label_data.mjs.
 * Labels are field_descriptions; keys and values stay exact. No inferred SAP mappings.
 */
export interface LabelFieldDefinition {
  key: string;
  label: string;
  category: string;
  businessType: 'string';
  source: string;
  example: string;
  bindingSupported: boolean;
}
export const LABEL_FIELD_CATALOG_VERSION = '2';
export const LABEL_FIELD_CONTRACT_SOURCE = 'docs/examples/label_data.sample.json';
export const LABEL_FIELD_CATALOG: readonly LabelFieldDefinition[] = [
  {
    "key": "ZZALIAS",
    "label": "Film Alias",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZALIAS",
    "example": "PET DEMO",
    "bindingSupported": true
  },
  {
    "key": "ZZPACKINGCODE",
    "label": "Packing Code",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZPACKINGCODE",
    "example": "PKG-TEST-01",
    "bindingSupported": true
  },
  {
    "key": "ZZLABEL",
    "label": "Type Label",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZLABEL",
    "example": "SAMPLE_ROLL",
    "bindingSupported": true
  },
  {
    "key": "ZZTYPE",
    "label": "Film Type",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZTYPE",
    "example": "PET",
    "bindingSupported": true
  },
  {
    "key": "ZZPACKING",
    "label": "Packing",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZPACKING",
    "example": "PALLET",
    "bindingSupported": true
  },
  {
    "key": "ZZTHICKNESS",
    "label": "Thickness",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZTHICKNESS",
    "example": "12",
    "bindingSupported": true
  },
  {
    "key": "ZZWIDTH",
    "label": "Width",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZWIDTH",
    "example": "1200",
    "bindingSupported": true
  },
  {
    "key": "ZZLENGTH",
    "label": "Length",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZLENGTH",
    "example": "6000",
    "bindingSupported": true
  },
  {
    "key": "ZZWEIGHT",
    "label": "Weight",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZWEIGHT",
    "example": "120.50",
    "bindingSupported": true
  },
  {
    "key": "ZZGRADE",
    "label": "Grade",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZGRADE",
    "example": "A",
    "bindingSupported": true
  },
  {
    "key": "ZZCRITERIA",
    "label": "Criteria",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZCRITERIA",
    "example": "STANDARD",
    "bindingSupported": true
  },
  {
    "key": "ZZCORE",
    "label": "Core",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZCORE",
    "example": "3 INCH",
    "bindingSupported": true
  },
  {
    "key": "ZZINSIDE",
    "label": "Inside Treatment",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZINSIDE",
    "example": "UNTREATED",
    "bindingSupported": true
  },
  {
    "key": "ZZOUTSIDE",
    "label": "Outside Treatment",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZOUTSIDE",
    "example": "CORONA",
    "bindingSupported": true
  },
  {
    "key": "ZZSPLICE-1",
    "label": "Splice 1",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZSPLICE-1",
    "example": "0",
    "bindingSupported": true
  },
  {
    "key": "ZZSPLICE-2",
    "label": "Splice 2",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZSPLICE-2",
    "example": "0",
    "bindingSupported": true
  },
  {
    "key": "ZZPRODLINE",
    "label": "Production Line",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZPRODLINE",
    "example": "LINE-TEST-01",
    "bindingSupported": true
  },
  {
    "key": "ZZMONTHYEAR",
    "label": "Month/Year JR",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZMONTHYEAR",
    "example": "10/2026",
    "bindingSupported": true
  },
  {
    "key": "ZZSEQUENCENBR",
    "label": "Sequence Number JR",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZSEQUENCENBR",
    "example": "000001",
    "bindingSupported": true
  },
  {
    "key": "ZZCODE",
    "label": "Film Code",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZCODE",
    "example": "PET12-1200",
    "bindingSupported": true
  },
  {
    "key": "ZZDERIVATIVEMS",
    "label": "Derivative Main Slit",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZDERIVATIVEMS",
    "example": "MS-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZDERIVATIVESS",
    "label": "Derivative Secondary Slit",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZDERIVATIVESS",
    "example": "SS-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZPOSITIONMS",
    "label": "Position Main Slit",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZPOSITIONMS",
    "example": "01",
    "bindingSupported": true
  },
  {
    "key": "ZZPOSITIONSS",
    "label": "Position Secondary Slit",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZPOSITIONSS",
    "example": "01",
    "bindingSupported": true
  },
  {
    "key": "ZZNOMORROLL",
    "label": "Roll Number",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZNOMORROLL",
    "example": "ROLL-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZEXPIREDLIVE",
    "label": "Expiry Day",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZEXPIREDLIVE",
    "example": "365",
    "bindingSupported": true
  },
  {
    "key": "ZZCONVERSIONROLLKG",
    "label": "Conversion Roll to KG",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZCONVERSIONROLLKG",
    "example": "120.50",
    "bindingSupported": true
  },
  {
    "key": "ZZLENGTHSHT",
    "label": "Length Short",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZLENGTHSHT",
    "example": "6000",
    "bindingSupported": true
  },
  {
    "key": "ZZSPECIALTOUCH-1",
    "label": "Special Touch 1",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZSPECIALTOUCH-1",
    "example": "STANDARD",
    "bindingSupported": true
  },
  {
    "key": "ZZSPECIALTOUCH-2",
    "label": "Special Touch 2",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZSPECIALTOUCH-2",
    "example": "STANDARD",
    "bindingSupported": true
  },
  {
    "key": "ZZSPECIALTOUCH-3",
    "label": "Special Touch 3",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZSPECIALTOUCH-3",
    "example": "STANDARD",
    "bindingSupported": true
  },
  {
    "key": "ZZNOROLLTOYOBO",
    "label": "Roll Number Toyobo",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZNOROLLTOYOBO",
    "example": "TY-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZNOLOTTOYOBO",
    "label": "Lot Number Toyobo",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZNOLOTTOYOBO",
    "example": "LOT-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZTAILORED",
    "label": "Tailored",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZTAILORED",
    "example": "NO",
    "bindingSupported": true
  },
  {
    "key": "ZZPOCUSTOMER",
    "label": "PO Customer",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZPOCUSTOMER",
    "example": "PO-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZSKU",
    "label": "SKU",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZSKU",
    "example": "SKU-PET12-1200",
    "bindingSupported": true
  },
  {
    "key": "ZZCUSTOMER",
    "label": "Customer",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZCUSTOMER",
    "example": "CUSTOMER DEMO",
    "bindingSupported": true
  },
  {
    "key": "ZZNOLOTSUBCONT",
    "label": "Lot Number SubCont 1",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZNOLOTSUBCONT",
    "example": "SC-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZNOLOTSUBCONT2",
    "label": "Lot Number SubCont 2",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZNOLOTSUBCONT2",
    "example": "SC-TEST-002",
    "bindingSupported": true
  },
  {
    "key": "ZZNOLOTSUBCONT3",
    "label": "Lot Number SubCont 3",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZNOLOTSUBCONT3",
    "example": "SC-TEST-003",
    "bindingSupported": true
  },
  {
    "key": "ZZUNITOFMEASURE",
    "label": "Unit of Measure",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZUNITOFMEASURE",
    "example": "M",
    "bindingSupported": true
  },
  {
    "key": "ZZBARC1",
    "label": "Barcode 1",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZBARC1",
    "example": "4006381333931",
    "bindingSupported": true
  },
  {
    "key": "ZZBCROLL",
    "label": "Barcode Roll",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZBCROLL",
    "example": "ROLL-TEST-001",
    "bindingSupported": true
  },
  {
    "key": "ZZROLL8",
    "label": "Roll 8",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZROLL8",
    "example": "00000001",
    "bindingSupported": true
  },
  {
    "key": "ZZROLL9",
    "label": "Roll 9",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZROLL9",
    "example": "000000001",
    "bindingSupported": true
  },
  {
    "key": "ZZEX",
    "label": "Expired Date",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZEX",
    "example": "2027-10-10",
    "bindingSupported": true
  },
  {
    "key": "ZZODR",
    "label": "Order",
    "category": "sap_label_fields",
    "businessType": "string",
    "source": "items[].data.ZZODR",
    "example": "ORDER-TEST-001",
    "bindingSupported": true
  }
];
export const LABEL_FIELD_GROUPS = [{id: 'sap_label_fields', label: 'SAP label fields'}];
const registry = new Map(LABEL_FIELD_CATALOG.map(field => [field.key, field]));
export function getLabelField(key: string): LabelFieldDefinition | undefined { return registry.get(key); }
export function labelTokenKeys(data: Record<string, unknown>, used: ReadonlySet<string> = new Set()): string[] {
  return [...new Set([...LABEL_FIELD_CATALOG.map(field => field.key), ...Object.keys(data), ...used])];
}
/** Exact canonical identity; no trimming, case folding or prototype names. */
export function isLabelFieldKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key);
}
export function canAddLabelField(key: string, existing: Iterable<string>): boolean {
  return isLabelFieldKey(key) && !new Set(existing).has(key);
}
