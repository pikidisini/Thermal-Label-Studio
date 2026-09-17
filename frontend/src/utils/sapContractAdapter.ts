import type { JsonObject, JsonValue } from '../types/api';

export interface RawSapContract extends JsonObject {
  contract_version: string;
  label_type?: string;
  label_code?: string;
  source: JsonObject;
  fields: JsonObject;
  codes: JsonObject;
}

export type FlatSapTokenMap = Record<string, string | number | boolean | null>;

const ALIAS_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['material_number', 'matnr'],
  ['batch_number', 'charg'],
  ['grade', 'criteria'],
  ['base_film', 'type_film'],
];

const SOURCE_TO_FIELD_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['matnr', 'material_number'],
  ['charg', 'batch_number'],
  ['werks', 'plant'],
];

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: JsonValue): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function withAliases(values: JsonObject): JsonObject {
  const result = { ...values };
  for (const [left, right] of ALIAS_GROUPS) {
    if (isScalar(result[left]) && result[right] === undefined) result[right] = result[left];
    if (isScalar(result[right]) && result[left] === undefined) result[left] = result[right];
  }
  return result;
}

export function adaptSapContract(input: JsonObject): { rawContract: RawSapContract; tokenMap: FlatSapTokenMap } {
  const fields = withAliases(isJsonObject(input.fields) ? input.fields : {});
  const codes = withAliases(isJsonObject(input.codes) ? input.codes : {});
  const source = isJsonObject(input.source) ? input.source : {};

  for (const [sourceKey, fieldKey] of SOURCE_TO_FIELD_ALIASES) {
    if (isScalar(source[sourceKey]) && fields[fieldKey] === undefined) {
      fields[fieldKey] = source[sourceKey];
    }
  }
  if (isScalar(input.label_type) && fields.label_type === undefined) fields.label_type = input.label_type;
  if (isScalar(input.label_code) && fields.label_code === undefined) fields.label_code = input.label_code;
  const normalizedFields = withAliases(fields);

  const rawContract: RawSapContract = {
    ...input,
    contract_version: typeof input.contract_version === 'string' ? input.contract_version : '1.1',
    source,
    fields: normalizedFields,
    codes,
  };
  const tokenMap: FlatSapTokenMap = {};
  for (const values of [normalizedFields, codes]) {
    for (const [key, value] of Object.entries(values)) {
      if (isScalar(value)) tokenMap[key] = value;
    }
  }
  return { rawContract, tokenMap };
}
