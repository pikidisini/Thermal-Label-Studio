import { API_BASE } from './apiConfig';
import type {
  SapShadowBatchRequest,
  SapShadowBatchResponse,
  SapShadowBatchRecord,
} from '../../types/sapShadowSimulation';

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === 'string') {
      return data.detail;
    }
  } catch {
    // Ignore JSON parse error
  }
  return fallback;
}

export const sapShadowSimulationApi = {
  async checkEnabled(): Promise<boolean> {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        return Boolean(data && data.sap_shadow_simulation_enabled === true);
      }
    } catch {
      // Fail-closed on network or parse error
    }
    return false;
  },

  async listBatches(token?: string): Promise<SapShadowBatchRecord[]> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-SAP-Simulation-Token'] = token;
    }
    const res = await fetch(`${API_BASE}/simulation/sap-batches`, { headers });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('SAP Shadow Simulation mode dinonaktifkan di backend.');
      }
      const msg = await parseErrorMessage(res, 'Gagal memuat daftar batch simulasi SAP');
      throw new Error(msg);
    }
    return res.json();
  },

  async submitBatch(
    request: SapShadowBatchRequest,
    token: string,
  ): Promise<SapShadowBatchResponse> {
    const res = await fetch(`${API_BASE}/simulation/sap-batches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SAP-Simulation-Token': token,
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('SAP Shadow Simulation mode dinonaktifkan di backend.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Otorisasi token simulasi gagal (X-SAP-Simulation-Token tidak valid atau belum dikonfigurasi).');
      }
      const msg = await parseErrorMessage(res, 'Gagal mengirim batch simulasi SAP');
      throw new Error(msg);
    }
    return res.json();
  },

  async getBatch(batchId: string, token?: string): Promise<SapShadowBatchRecord> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-SAP-Simulation-Token'] = token;
    }
    const res = await fetch(`${API_BASE}/simulation/sap-batches/${encodeURIComponent(batchId)}`, {
      headers,
    });

    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Gagal memuat status batch simulasi SAP');
      throw new Error(msg);
    }
    return res.json();
  },

  getDownloadUrl(batchId: string): string {
    return `${API_BASE}/simulation/sap-batches/${encodeURIComponent(batchId)}/pdf`;
  },

  async downloadPdf(batchId: string, token?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-SAP-Simulation-Token'] = token;
    }
    const res = await fetch(this.getDownloadUrl(batchId), {
      headers,
    });

    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Gagal mengunduh PDF evidence simulasi');
      throw new Error(msg);
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `evidence_${batchId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
  },
};
