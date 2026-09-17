import { API_BASE } from './apiConfig';

export const printApi = {
  async listSpoolerPrinters() {
    try {
      const res = await fetch(`${API_BASE}/print/printers`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return { printers: data, default_printer: data[0] || '' };
        }
        return data;
      }
    } catch (e) {
      console.warn('Backend print spooler service unreachable');
    }
    return { printers: ['ZDesigner ZT230-200dpi (Mock)', 'ZDesigner ZD420-203dpi (Mock)', 'Microsoft Print to PDF'], default_printer: 'ZDesigner ZT230-200dpi (Mock)' };
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Batch print dispatch failed' }));
      throw new Error(err.detail || 'Batch print dispatch failed');
    }
    return res.json();
  }
};
