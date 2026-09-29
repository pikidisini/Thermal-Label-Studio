import type { JsonObject } from '../types/api';
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
  format: 'v1.1' | 'raw-v2';
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
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} wajib berupa teks tidak kosong.`);
  return value;
}

function requireSequence(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} wajib berupa nomor positif unik.`);
  return value as number;
}

function buildItem(itemSequence: number, input: JsonObject, labelCode?: string, tokenCategories?: Record<string, 'customer' | 'characteristic'>): LocalSapItem {
  const adapted = adaptSapContract(input);
  return { itemSequence, labelCode, contract: adapted.rawContract, tokenMap: adapted.tokenMap, tokenCategories };
}

function parseV11(value: JsonObject): LocalSapImport {
  if (!isObject(value.fields) || !isObject(value.codes) || !isObject(value.source)) {
    throw new Error('Format v1.1 membutuhkan object fields, codes, dan source.');
  }
  for (const [section, data] of [['fields', value.fields], ['codes', value.codes], ['source', value.source]] as const) {
    for (const [key, entry] of Object.entries(data)) {
      if (!isScalar(entry)) throw new Error(`${section}.${key} harus bernilai scalar atau null.`);
    }
  }
  return { format: 'v1.1', items: [buildItem(1, value)], warnings: [] };
}

function parseRawV2(value: JsonObject): LocalSapImport {
  if (!Array.isArray(value.items) || value.items.length === 0 || value.items.length > MAX_ITEMS) {
    throw new Error(`Raw v2 membutuhkan 1-${MAX_ITEMS} item.`);
  }
  const seen = new Set<number>();
  const warnings: string[] = [];
  const items = value.items.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`items[${index}] harus berupa object.`);
    const itemSequence = requireSequence(entry.item_sequence, `items[${index}].item_sequence`);
    if (seen.has(itemSequence)) throw new Error(`item_sequence ${itemSequence} muncul lebih dari sekali.`);
    seen.add(itemSequence);
    if (!Array.isArray(entry.characteristics) || entry.characteristics.length > MAX_CHARACTERISTICS) {
      throw new Error(`items[${index}].characteristics melebihi batas ${MAX_CHARACTERISTICS}.`);
    }
    const fields: JsonObject = {};
    const names = new Set<string>();
    const normalizedNames = new Set<string>();
    for (const [charIndex, characteristic] of entry.characteristics.entries()) {
      if (!isObject(characteristic)) throw new Error(`characteristics[${charIndex}] harus berupa object.`);
      const name = requireString(characteristic.name, `items[${index}].characteristics[${charIndex}].name`);
      if (normalizedNames.has(name.toLocaleLowerCase())) throw new Error(`Nama characteristic ${name} duplikat pada item ${itemSequence}.`);
      names.add(name);
      normalizedNames.add(name.toLocaleLowerCase());
      if (!isScalar(characteristic.value)) throw new Error(`Nilai characteristic ${name} harus scalar atau null.`);
      fields[name] = characteristic.value;
    }
    const businessContext = entry.business_context === undefined ? {} : entry.business_context;
    if (!isObject(businessContext)) throw new Error(`business_context item ${itemSequence} harus berupa object.`);
    for (const [key, contextValue] of Object.entries(businessContext)) {
      if (normalizedNames.has(key.toLocaleLowerCase())) throw new Error(`Nama business_context ${key} bertabrakan dengan characteristic.`);
      if (!isScalar(contextValue)) {
        warnings.push(`business_context.${key} item ${itemSequence} tidak scalar dan dilewati dari token.`);
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
  if (!isObject(value)) throw new Error('JSON harus berupa object pada root.');
  if (value.contract_schema_version === '2.0-raw') return parseRawV2(value);
  if (value.contract_version === undefined || value.contract_version === '1.1') return parseV11(value);
  throw new Error('Schema JSON lokal tidak didukung. Gunakan v1.1 atau 2.0-raw.');
}

export async function readLocalSapJson(file: File): Promise<LocalSapImport> {
  if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Hanya berkas .json yang diperbolehkan.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Ukuran JSON melebihi batas maksimum 2 MiB.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Isi berkas bukan JSON yang valid.'); }
  return parseLocalSapJson(parsed);
}
