/** Editor-only sample feedback. Never supplies facts to output binding. */
export function designPreviewSample(sample: unknown): string {
  return typeof sample === 'string' && sample.length > 0 && !/no data|\{\{/i.test(sample)
    ? sample : 'Sample';
}

export function shouldUseDesignPreviewSample(activeContractKey: string, keys: readonly string[], data: Record<string, unknown>): boolean {
  return activeContractKey === 'demo-defaults' && keys.some(key => !Object.prototype.hasOwnProperty.call(data, key));
}
