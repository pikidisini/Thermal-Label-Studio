/**
 * SAP ECC 6.0 Data Type System — Token Binding Types
 * Setiap field memiliki metadata tipe data sesuai standar ABAP Dictionary.
 */

/** SAP ABAP Dictionary primitive data types */
export type SAPAbapType =
  | 'CHAR'   // Character string
  | 'NUMC'   // Numeric character (digits only)
  | 'DATS'   // Date (YYYYMMDD, 8 chars)
  | 'TIMS'   // Time (HHMMSS, 6 chars)
  | 'DEC'    // Packed decimal number
  | 'CURR'   // Currency amount (linked to currency field)
  | 'QUAN'   // Quantity (linked to unit field)
  | 'INT4'   // 4-byte integer
  | 'CLNT';  // Client (3 char, system-level)

/** Metadata untuk satu SAP field di ABAP Dictionary */
export interface SAPFieldMeta {
  abapType: SAPAbapType;
  /** Panjang total field (dalam karakter untuk CHAR/NUMC, digit untuk DEC/CURR) */
  length: number;
  /** Jumlah desimal (hanya untuk DEC, CURR, QUAN) */
  decimals?: number;
  /** Teks deskriptif untuk tooltip di Token Drawer */
  description: string;
}

/** Registry data type SAP ECC 6 standard untuk token-token umum */
export const SAP_FIELD_REGISTRY: Record<string, SAPFieldMeta> = {
  MATNR: { abapType: 'CHAR', length: 18, description: 'Material Number (CHAR 18)' },
  EBELN: { abapType: 'CHAR', length: 10, description: 'Purchasing Document No. (CHAR 10)' },
  EBELP: { abapType: 'NUMC', length: 5,  description: 'PO Line Item (NUMC 5)' },
  MENGE: { abapType: 'QUAN', length: 13, decimals: 3, description: 'Quantity (QUAN 13.3)' },
  MEINS: { abapType: 'CHAR', length: 3,  description: 'Base Unit of Measure (CHAR 3)' },
  NETPR: { abapType: 'CURR', length: 11, decimals: 2, description: 'Net Price (CURR 11.2)' },
  WAERS: { abapType: 'CHAR', length: 5,  description: 'Currency Key (CHAR 5)' },
  BEDAT: { abapType: 'DATS', length: 8,  description: 'Document Date (DATS 8 = YYYYMMDD)' },
  EINDT: { abapType: 'DATS', length: 8,  description: 'Delivery Date (DATS 8 = YYYYMMDD)' },
  LIFNR: { abapType: 'CHAR', length: 10, description: 'Vendor Account Number (CHAR 10)' },
  WERKS: { abapType: 'CHAR', length: 4,  description: 'Plant (CHAR 4)' },
  LGORT: { abapType: 'CHAR', length: 4,  description: 'Storage Location (CHAR 4)' },
  BUKRS: { abapType: 'CHAR', length: 4,  description: 'Company Code (CHAR 4)' },
  EKGRP: { abapType: 'CHAR', length: 3,  description: 'Purchasing Group (CHAR 3)' },
  TXZ01: { abapType: 'CHAR', length: 40, description: 'Short Text (CHAR 40)' },
  MATKL: { abapType: 'CHAR', length: 9,  description: 'Material Group (CHAR 9)' },
  BRGEW: { abapType: 'QUAN', length: 13, decimals: 3, description: 'Gross Weight (QUAN 13.3)' },
  NTGEW: { abapType: 'QUAN', length: 13, decimals: 3, description: 'Net Weight (QUAN 13.3)' },
  GEWEI: { abapType: 'CHAR', length: 3,  description: 'Weight Unit (CHAR 3)' },
  MANDT: { abapType: 'CLNT', length: 3,  description: 'Client (CLNT 3)' },
};

/** Satu field SAP yang akan ditampilkan di Token Drawer */
export interface SAPContractField {
  key: string;
  label: string;
  sampleValue: string;
  category?: 'header' | 'item' | 'logistics' | 'custom';
  /** Referensi ke SAP_FIELD_REGISTRY untuk validasi & tooltip */
  sapFieldName?: keyof typeof SAP_FIELD_REGISTRY;
}

export type SAPContractData = Record<string, unknown>;

/** Token binding antara placeholder di label dengan path data SAP */
export interface TokenBinding {
  token: string;
  path: string;
  resolvedValue?: string;
}

/**
 * Mendapatkan format display singkat untuk tooltip (misal: "CHAR 18", "DATS 8", "DEC 13.3")
 */
export function getSAPTypeLabel(fieldName: string): string {
  const meta = SAP_FIELD_REGISTRY[fieldName];
  if (!meta) return '';
  if (meta.decimals !== undefined) {
    return `${meta.abapType} ${meta.length}.${meta.decimals}`;
  }
  return `${meta.abapType} ${meta.length}`;
}

/**
 * Mendapatkan max-length untuk input validasi di Token Drawer
 */
export function getSAPMaxLength(fieldName: string): number | undefined {
  return SAP_FIELD_REGISTRY[fieldName]?.length;
}
