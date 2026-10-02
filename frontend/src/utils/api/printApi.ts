import { getCsrfHeaders } from '../../features/auth';
import { API_BASE } from '../../shared/api';

export const printApi = {
  async listSpoolerPrinters() {
    const res = await fetch(`${API_BASE}/print/printers`, { credentials: 'same-origin' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Hardware printer capability is unavailable' }));
      throw new Error(err.detail || 'Hardware printer capability is unavailable');
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      return { printers: data, default_printer: data[0] || '' };
    }
    if (data && Array.isArray(data.printers)) {
      return data;
    }
    throw new Error('Hardware printer capability response is invalid');
  },

  async printDirect(dispatchModeOrPayload: any, maybePayload?: any) {
    let mode = 'tcp';
    let payload = dispatchModeOrPayload;

    if (typeof dispatchModeOrPayload === 'string') {
      mode = dispatchModeOrPayload;
      payload = maybePayload || {};
    } else if (payload?.method) {
      mode = (payload.method === 'spooler' || payload.method === 'windows_spooler') ? 'spooler' : 'tcp';
    }

    const endpoint = mode === 'tcp' ? `${API_BASE}/print/tcp` : `${API_BASE}/print/spooler`;
    const bodyPayload = {
      ...payload,
      host: payload.host || payload.ip,
      printer_format: payload.printer_format || payload.protocol || payload.format || 'zpl',
      data: payload.data || payload.json_data || {},
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
      credentials: 'same-origin',
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Direct print dispatch failed' }));
      throw new Error(err.detail || 'Direct print dispatch failed');
    }
    return res.json();
  },

  async printBatch(payload: {
    template_id?: string;
    svg_content?: string;
    data_list: any[];
    format?: string;
    dpi?: number;
    threshold?: number;
    destination?: 'tcp' | 'spooler';
    target?: string;
    port?: number;
    delay_between_labels?: number;
  }) {
    const res = await fetch(`${API_BASE}/print/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Batch print dispatch failed' }));
      throw new Error(err.detail || 'Batch print dispatch failed');
    }
    return res.json();
  }
};
