import { authFetch as fetch } from '../../../shared/auth/client';
import { API_BASE } from '../../../shared/api';

export type ConfiguredPrinter = { target_id: string; host: string; port: number; enabled: boolean; language: 'IPL'; connection: 'Ethernet'; transport: 'TCP/RAW' };
export async function getConfiguredPrinters(signal: AbortSignal): Promise<ConfiguredPrinter[]> {
  const response = await fetch(`${API_BASE}/label-print/printers`, { signal });
  if (!response.ok) throw new Error('Configured printers could not be loaded.');
  const result = await response.json();
  if (!result || !['management', 'environment', 'unconfigured'].includes(result.policy_origin) || !Array.isArray(result.printers)) throw new Error('Invalid printer configuration response.');
  const ids = new Set<string>();
  for (const printer of result.printers) {
    if (!printer || typeof printer.target_id !== 'string' || !printer.target_id || ids.has(printer.target_id)
      || typeof printer.host !== 'string' || !printer.host || printer.host.length > 63
      || !Number.isInteger(printer.port) || printer.port < 1 || printer.port > 65535
      || typeof printer.enabled !== 'boolean' || printer.language !== 'IPL' || printer.connection !== 'Ethernet' || printer.transport !== 'TCP/RAW') throw new Error('Invalid printer configuration response.');
    ids.add(printer.target_id);
  }
  return result.printers;
}
