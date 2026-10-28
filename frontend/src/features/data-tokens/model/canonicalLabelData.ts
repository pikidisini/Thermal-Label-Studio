/** Canonical data validation; no output or storage side effects. */
import { isLabelFieldKey } from './labelFieldCatalog';
import type { JsonObject } from '../../../types/api';
export const MAX_LABEL_DATA_BYTES = 2 * 1024 * 1024;
export type LabelMode = 'simulation' | 'print';
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
function fail(): never { throw new Error('Label data validation failed.'); }
function text(value: unknown, limit = 4096, bytes = 16384): asserts value is string {
  if (typeof value !== 'string' || Array.from(value).length > limit || value.includes('\0') || new TextEncoder().encode(value).length > bytes) { fail(); }
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) { fail(); }
  }
}
function shape(value: unknown, required: string[], optional: string[] = []): asserts value is JsonObject {
  if (!object(value) || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) { fail(); }
}
function fields(value: unknown, descriptions = false) {
  if (!object(value) || Object.keys(value).length > 200) { fail(); }
  for (const [key, entry] of Object.entries(value)) {
    if (!isLabelFieldKey(key)) { fail(); }
    if (descriptions) { text(entry, 256, 1024); }
    else if (typeof entry === 'string') { text(entry); }
    else if (typeof entry === 'number') { if (!Number.isFinite(entry) || Number.isInteger(entry) && !Number.isSafeInteger(entry)) { fail(); } }
    else if (entry !== null && typeof entry !== 'boolean') { fail(); }
  }
}
export function validateCanonicalLabelData(value: unknown): JsonObject {
  shape(value, ['sender', 'request_id', 'mode', 'items'], ['field_descriptions', 'target_id']);
  shape(value.sender, ['system']);
  const identity = (input: unknown, regex = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}(?![\s\S])/) => { text(input, 128, 128); if (!regex.test(input)) { fail(); } };
  identity(value.sender.system); identity(value.request_id);
  if (value.mode !== 'simulation' && value.mode !== 'print') { throw new Error('mode must be either simulation or print.'); }
  if (Object.prototype.hasOwnProperty.call(value, 'target_id')) {
    identity(value.target_id);
  }
  if (value.field_descriptions !== undefined) { fields(value.field_descriptions, true); }
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 100) { fail(); }
  const seen = new Set<string>();
  for (const item of value.items) {
    shape(item, ['item_id', 'label_code', 'copies', 'data']);
    identity(item.item_id); identity(item.label_code, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}(?![\s\S])/);
    const itemId = item.item_id as string;
    if (seen.has(itemId)) { fail(); } seen.add(itemId);
    if (typeof item.copies !== 'number' || !Number.isInteger(item.copies) || item.copies < 1 || item.copies > 999) { throw new Error('copies must be an integer from 1 to 999.'); }
    fields(item.data);
  }
  if (reservedSize(value) > MAX_LABEL_DATA_BYTES) { fail(); }
  return value;
}
/** Parse raw JSON before JSON.parse loses duplicate members, including escaped keys. */
export function parseBoundedJson(raw: string): unknown {
  if (new TextEncoder().encode(raw).length > MAX_LABEL_DATA_BYTES || raw.startsWith('\ufeff')) { fail(); }
  return new BoundedJsonReader(raw).parse();
}

class BoundedJsonReader {
  private cursor = 0;
  constructor(private readonly raw: string) {}

  parse(): unknown {
    this.value(0);
    this.space();
    if (this.cursor !== this.raw.length) { fail(); }
    return JSON.parse(this.raw);
  }

  private space(): void {
    while (/\s/.test(this.raw[this.cursor] ?? '') && this.cursor < this.raw.length) { this.cursor++; }
  }

  private string(): string {
    const start = this.cursor++;
    let escaped = false;
    while (this.cursor < this.raw.length) {
      const c = this.raw[this.cursor++];
      if (!escaped && c === '"') { return JSON.parse(this.raw.slice(start, this.cursor)); }
      if (!escaped && c === '\\') { escaped = true; } else { escaped = false; }
    }
    return fail();
  }

  private object(depth: number): void {
    this.cursor++;
    this.space();
    const seen = new Set<string>();
    if (this.raw[this.cursor] === '}') { this.cursor++; return; }
    while (this.cursor < this.raw.length) {
      this.space();
      if (this.raw[this.cursor] !== '"') { fail(); }
      const key = this.string();
      if (seen.has(key) || forbidden.has(key)) { fail(); }
      seen.add(key);
      this.space();
      if (this.raw[this.cursor++] !== ':') { fail(); }
      this.value(depth + 1);
      this.space();
      const next = this.raw[this.cursor++];
      if (next === '}') { return; }
      if (next !== ',') { fail(); }
    }
    fail();
  }

  private array(depth: number): void {
    this.cursor++;
    this.space();
    if (this.raw[this.cursor] === ']') { this.cursor++; return; }
    while (this.cursor < this.raw.length) {
      this.value(depth + 1);
      this.space();
      const next = this.raw[this.cursor++];
      if (next === ']') { return; }
      if (next !== ',') { fail(); }
    }
    fail();
  }

  private value(depth: number): void {
    if (depth > 32) { fail(); }
    this.space();
    const c = this.raw[this.cursor];
    if (c === '{') { this.object(depth); }
    else if (c === '[') { this.array(depth); }
    else if (c === '"') { this.string(); }
    else {
      const start = this.cursor;
      while (this.cursor < this.raw.length && !/[\s,\]}]/.test(this.raw[this.cursor])) { this.cursor++; }
      if (this.cursor === start) { fail(); }
    }
  }
}

function reservedSize(value: unknown): number {
  if (typeof value === 'string') { return new TextEncoder().encode(JSON.stringify(value)).length; }
  if (Array.isArray(value)) { return 2 + Math.max(0, value.length - 1) + value.reduce((sum, entry) => sum + reservedSize(entry), 0); }
  if (object(value)) { return 2 + Math.max(0, Object.keys(value).length - 1) + Object.entries(value).reduce((sum, [key, entry]) => sum + reservedSize(key) + 1 + reservedSize(entry), 0); }
  if (typeof value === 'boolean') { return value ? 4 : 5; }
  return value === null ? 4 : 32;
}
