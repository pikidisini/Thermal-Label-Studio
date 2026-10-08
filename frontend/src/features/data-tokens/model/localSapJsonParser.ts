import type { JsonObject } from '../../../types/api';
import { adaptSapContract } from './sapContractAdapter';
import type { FlatSapTokenMap, RawSapContract } from './sapContractAdapter';

const MAX_ITEMS = 100;
const MAX_CHARACTERISTICS = 200;

export interface LocalSapItem {
  itemSequence: number;
  labelCode?: string;
  contract: RawSapContract;
  tokenMap: FlatSapTokenMap;
  tokenCategories?: Record<string, 'customer' | 'characteristic'>;
}

export interface LocalSapImport {
  format: 'v1.1' | 'raw-v2' | 'data';
  items: LocalSapItem[];
  warnings: string[];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be non-empty text.`);
  return value;
}

function requireSequence(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a unique positive number.`);
  return value as number;
}

function buildItem(itemSequence: number, input: JsonObject, labelCode?: string, tokenCategories?: Record<string, 'customer' | 'characteristic'>): LocalSapItem {
  const adapted = adaptSapContract(input);
  return { itemSequence, labelCode, contract: adapted.rawContract, tokenMap: adapted.tokenMap, tokenCategories };
}

function parseV11(value: JsonObject): LocalSapImport {
  if (!isObject(value.fields) || !isObject(value.codes) || !isObject(value.source)) {
    throw new Error('Format v1.1 requires fields, codes, and source objects.');
  }
  for (const [section, data] of [['fields', value.fields], ['codes', value.codes], ['source', value.source]] as const) {
    for (const [key, entry] of Object.entries(data)) {
      if (!isScalar(entry)) throw new Error(`${section}.${key} must be a scalar or null.`);
    }
  }
  return { format: 'v1.1', items: [buildItem(1, value)], warnings: [] };
}

function parseRawV2(value: JsonObject): LocalSapImport {
  if (!Array.isArray(value.items) || value.items.length === 0 || value.items.length > MAX_ITEMS) {
    throw new Error(`Raw v2 requires 1-${MAX_ITEMS} items.`);
  }
  const seen = new Set<number>();
  const warnings: string[] = [];
  const items = value.items.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`items[${index}] must be an object.`);
    const itemSequence = requireSequence(entry.item_sequence, `items[${index}].item_sequence`);
    if (seen.has(itemSequence)) throw new Error(`item_sequence ${itemSequence} appears more than once.`);
    seen.add(itemSequence);
    if (!Array.isArray(entry.characteristics) || entry.characteristics.length > MAX_CHARACTERISTICS) {
      throw new Error(`items[${index}].characteristics exceeds the limit of ${MAX_CHARACTERISTICS}.`);
    }
    const fields: JsonObject = {};
    const names = new Set<string>();
    const normalizedNames = new Set<string>();
    for (const [charIndex, characteristic] of entry.characteristics.entries()) {
      if (!isObject(characteristic)) throw new Error(`characteristics[${charIndex}] must be an object.`);
      const name = requireString(characteristic.name, `items[${index}].characteristics[${charIndex}].name`);
      if (normalizedNames.has(name.toLocaleLowerCase())) throw new Error(`Characteristic name ${name} is duplicated in item ${itemSequence}.`);
      names.add(name);
      normalizedNames.add(name.toLocaleLowerCase());
      if (!isScalar(characteristic.value)) throw new Error(`Characteristic value ${name} must be a scalar or null.`);
      fields[name] = characteristic.value;
    }
    const businessContext = entry.business_context === undefined ? {} : entry.business_context;
    if (!isObject(businessContext)) throw new Error(`business_context item ${itemSequence} must be an object.`);
    for (const [key, contextValue] of Object.entries(businessContext)) {
      if (normalizedNames.has(key.toLocaleLowerCase())) throw new Error(`business_context name ${key} conflicts with a characteristic.`);
      if (!isScalar(contextValue)) {
        warnings.push(`business_context.${key} item ${itemSequence} is not a scalar and was skipped from tokens.`);
        continue;
      }
      fields[key] = contextValue;
      normalizedNames.add(key.toLocaleLowerCase());
    }
    const labelCode = entry.label_code === undefined ? undefined : requireString(entry.label_code, `items[${index}].label_code`);
    return buildItem(itemSequence, {
      contract_schema_version: '2.0-raw',
      label_code: labelCode ?? '',
      source: { kind: 'local-raw-v2', item_sequence: itemSequence },
      fields,
      codes: {},
    }, labelCode, Object.fromEntries([
      ...Array.from(names, (name) => [name, 'characteristic' as const] as const),
      ...Object.keys(businessContext)
        .filter((name) => /^(customer(?:_|$)|kunnr$|sold_to$|ship_to$)/i.test(name))
        .map((name) => [name, 'customer' as const] as const),
    ]));
  });
  return { format: 'raw-v2', items: items.sort((a, b) => a.itemSequence - b.itemSequence), warnings };
}

export function parseLocalSapJson(value: unknown): LocalSapImport {
  if (!isObject(value)) throw new Error('JSON must be an object at the root.');
  if (value.sender !== undefined && value.contract_schema_version === undefined && value.contract_version === undefined) return parseDataEnvelope(value);
  if (value.contract_schema_version === '2.0-raw') return parseRawV2(value);
  if (value.contract_version === undefined || value.contract_version === '1.1') return parseV11(value);
  throw new Error('Local JSON schema is unsupported. Use v1.1 or 2.0-raw.');
}

function parseDataEnvelope(value: JsonObject): LocalSapImport {
  if (!isObject(value.sender)) throw new Error('sender must be an object.');
  requireString(value.sender.system, 'sender.system');
  requireString(value.request_id, 'request_id');
  const descriptions = value.field_descriptions === undefined ? {} : value.field_descriptions;
  if (!isObject(descriptions) || Object.keys(descriptions).length > MAX_CHARACTERISTICS) throw new Error('field_descriptions must be an object with at most 200 entries.');
  for (const [key, description] of Object.entries(descriptions)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsupported description field name.');
    if (typeof description !== 'string' || description.length > 256) throw new Error('Field descriptions must be strings of at most 256 characters.');
  }
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_ITEMS) {
    throw new Error(`Payload requires 1-${MAX_ITEMS} items.`);
  }
  const identities = new Set<string>();
  const items = value.items.map((entry, index) => {
    if (!isObject(entry)) throw new Error('Each item must be an object.');
    const itemId = requireString(entry.item_id, 'item_id');
    if (identities.has(itemId)) throw new Error('item_id must be unique.');
    identities.add(itemId);
    const labelCode = requireString(entry.label_code, 'label_code');
    if (!Number.isInteger(entry.copies) || Number(entry.copies) < 1 || Number(entry.copies) > 1000) throw new Error('copies must be an integer from 1 to 1000.');
    if (!isObject(entry.data) || Object.keys(entry.data).length > MAX_CHARACTERISTICS) throw new Error(`data must contain at most ${MAX_CHARACTERISTICS} fields.`);
    for (const [key, fieldValue] of Object.entries(entry.data)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsupported data field name.');
      if (!isScalar(fieldValue) || (typeof fieldValue === 'number' && !Number.isFinite(fieldValue))) throw new Error(`data.${key} must be a finite scalar or null.`);
    }
    return buildItem(index + 1, {
      label_code: labelCode,
      source: { sender: value.sender, request_id: value.request_id, item_id: itemId, copies: entry.copies },
      fields: entry.data,
      codes: {},
      field_descriptions: descriptions,
    }, labelCode);
  });
  return { format: 'data', items, warnings: [] };
}

export async function readLocalSapJsonSource(file: File): Promise<{ source: unknown; parsed: LocalSapImport }> {
  if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Only .json files are allowed.');
  if (file.size > 2 * 1024 * 1024) throw new Error('JSON exceeds the maximum size of 2 MiB.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('The file does not contain valid JSON.'); }
  return { source: parsed, parsed: parseLocalSapJson(parsed) };
}

export async function readLocalSapJson(file: File): Promise<LocalSapImport> {
  return (await readLocalSapJsonSource(file)).parsed;
}
