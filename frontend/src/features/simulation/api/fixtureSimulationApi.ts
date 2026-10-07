export type FixtureScenario = 'sample' | 'mixed';
const stages = ['RECEIVED', 'RESOLVING_LAYOUT', 'BINDING_TEMPLATE', 'RASTERIZING', 'CAPTURED', 'FAILED'] as const;
type Stage = typeof stages[number];
export interface FixtureItem {
  item_index: number;
  item_id: string;
  status: 'CAPTURED' | 'FAILED';
  trace: Array<{ status: Stage; message: string }>;
  preview: { media_type: 'image/png'; width_px: 640; height_px: 1600; dpi: 203.2; png_base64: string } | null;
  error: { code: string; message: string } | null;
}
export interface FixtureResult {
  request_id: string;
  schema_version: 1;
  label_code: 'roll_80x200';
  layout_version: 'fixture-v1';
  items: FixtureItem[];
}
const invalid = () => { throw new Error('The fixture preview response is invalid.'); };
const object = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) return invalid();
  return record;
};
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const errorCodes = ['unknown_label_code', 'invalid_template_or_facts', 'raster_failed', 'processing_failed'];

/** Check structure, bounds and outcomes before any server bytes reach an image. */
export function parseFixtureResult(value: unknown): FixtureResult {
  const result = object(value, ['request_id', 'schema_version', 'label_code', 'layout_version', 'items']);
  if (typeof result.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result.request_id)) return invalid();
  if (result.schema_version !== 1 || result.label_code !== 'roll_80x200' || result.layout_version !== 'fixture-v1' || !Array.isArray(result.items) || result.items.length < 1 || result.items.length > 3) return invalid();
  result.items.forEach((value, index) => {
    const item = object(value, ['item_index', 'item_id', 'status', 'trace', 'preview', 'error']);
    if (item.item_index !== index || item.item_id !== `fixture-${index + 1}` || !['CAPTURED', 'FAILED'].includes(item.status as string) || !Array.isArray(item.trace) || item.trace.length < 2 || item.trace.length > 5) return invalid();
    const trace = item.trace.map((entry) => {
      const t = object(entry, ['status', 'message']);
      if (!stages.includes(t.status as Stage) || !text(t.message, 128)) return invalid();
      return t.status;
    });
    if (trace[0] !== 'RECEIVED' || trace[trace.length - 1] !== item.status) return invalid();
    const attempted = trace.slice(0, -1);
    if (attempted.some((stage, position) => stage !== stages[position])) return invalid();
    if (item.status === 'CAPTURED') {
      if (item.error !== null || trace.length !== 5) return invalid();
      const p = object(item.preview, ['media_type', 'width_px', 'height_px', 'dpi', 'png_base64']);
      if (p.media_type !== 'image/png' || p.width_px !== 640 || p.height_px !== 1600 || (typeof p.dpi !== 'number' || !Number.isFinite(p.dpi) || Math.abs(p.dpi - 203.2) > Number.EPSILON * 203.2) || !text(p.png_base64, 87384) || p.png_base64.length % 4 !== 0 || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(p.png_base64)) return invalid();
    } else {
      if (item.preview !== null) return invalid();
      const error = object(item.error, ['code', 'message']);
      if (!errorCodes.includes(error.code as string) || !text(error.message, 128)) return invalid();
    }
  });
  return result as unknown as FixtureResult;
}

export function fixturePreviewUrl(item: FixtureItem): string | null {
  return item.status === 'CAPTURED' && item.preview ? `data:image/png;base64,${item.preview.png_base64}` : null;
}

export async function runFixtureSimulation(scenario: FixtureScenario, signal?: AbortSignal): Promise<FixtureResult> {
  if (scenario !== 'sample' && scenario !== 'mixed') throw new Error('Choose a fixture scenario.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 60000);
  try {
    const response = await fetch('/api/v1/simulation/fixture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }), signal: controller.signal, credentials: 'omit',
    });
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id');
      const suffix = requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId) ? ` Request ID: ${requestId}` : '';
      throw new Error(`Fixture simulation could not be completed. Please try again.${suffix}`);
    }
    if (!response.headers.get('content-type')?.startsWith('application/json') || !response.body) return invalid();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 300000) { await reader.cancel(); return invalid(); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return invalid(); }
    const result = parseFixtureResult(value);
    if (result.items.length !== (scenario === 'sample' ? 1 : 3)) return invalid();
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Fixture simulation was interrupted or took too long. Please try again.');
    if (error instanceof Error && (error.message.startsWith('The fixture preview') || error.message.startsWith('Fixture simulation could'))) throw error;
    throw new Error('Unable to reach fixture simulation. Please try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
