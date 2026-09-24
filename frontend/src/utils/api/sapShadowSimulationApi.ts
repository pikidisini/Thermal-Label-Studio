import { API_BASE } from './apiConfig';
import type {
  SapShadowBatchRequest,
  SapShadowBatchResponse,
  SapShadowBatchRecord,
  PilotOperatorSessionStatus,
  PilotOperatorLoginResponse,
  PilotOperatorBatchSummary,
  PilotOperatorBatchDetail,
  OperatorRawImportResult,
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

  // =========================================================================
  // PILOT OPERATOR SELF-SERVICE METHODS (B2B2N)
  // Protected strictly by HttpOnly session cookie.
  // =========================================================================

  async getSimulationStatus(): Promise<{
    enabled: boolean;
    status: string;
    service: string;
    monitoring_requires_identity_provider: boolean;
    pilot_operator_enabled: boolean;
  }> {
    const res = await fetch(`${API_BASE}/simulation/status`);
    if (!res.ok) {
      return {
        enabled: false,
        status: 'disabled',
        service: 'SAP_SHADOW_SIMULATION_SINK',
        monitoring_requires_identity_provider: true,
        pilot_operator_enabled: false,
      };
    }
    return res.json();
  },

  async getOperatorSession(): Promise<PilotOperatorSessionStatus> {
    try {
      const res = await fetch(`${API_BASE}/simulation/operator/session`, {
        credentials: 'same-origin',
      });
      if (res.ok) {
        return res.json();
      }
    } catch {
      // Fail closed
    }
    return {
      pilot_operator_enabled: false,
      authenticated: false,
    };
  },

  async loginOperator(password: string): Promise<PilotOperatorLoginResponse> {
    const res = await fetch(`${API_BASE}/simulation/operator/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Mode operator pilot dinonaktifkan di server.');
      }
      if (res.status === 429) {
        const detail = await parseErrorMessage(res, 'Terlalu banyak percobaan login gagal. Klien dikunci sementara.');
        throw new Error(detail);
      }
      if (res.status === 403) {
        const detail = await parseErrorMessage(res, 'Akses operator pilot ditolak.');
        throw new Error(detail);
      }
      if (res.status === 401) {
        throw new Error('Kata sandi operator pilot tidak valid.');
      }
      const msg = await parseErrorMessage(res, 'Gagal masuk sebagai operator pilot');
      throw new Error(msg);
    }

    return res.json();
  },

  async logoutOperator(csrfToken?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const res = await fetch(`${API_BASE}/simulation/operator/logout`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
    });

    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Gagal keluar sesi operator pilot');
      throw new Error(msg);
    }
  },

  async listOperatorBatches(): Promise<PilotOperatorBatchSummary[]> {
    const res = await fetch(`${API_BASE}/simulation/operator/batches`, {
      credentials: 'same-origin',
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Sesi operator pilot tidak valid atau telah berakhir.');
      }
      const msg = await parseErrorMessage(res, 'Gagal memuat daftar batch simulasi operator');
      throw new Error(msg);
    }

    return res.json();
  },

  async getOperatorBatch(batchId: string): Promise<PilotOperatorBatchDetail> {
    const res = await fetch(`${API_BASE}/simulation/operator/batches/${encodeURIComponent(batchId)}`, {
      credentials: 'same-origin',
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Sesi operator pilot tidak valid atau telah berakhir.');
      }
      const msg = await parseErrorMessage(res, 'Gagal memuat rincian batch simulasi');
      throw new Error(msg);
    }

    return res.json();
  },

  getOperatorPdfUrl(batchId: string): string {
    return `${API_BASE}/simulation/operator/batches/${encodeURIComponent(batchId)}/pdf`;
  },

  async downloadOperatorPdf(batchId: string): Promise<void> {
    const res = await fetch(this.getOperatorPdfUrl(batchId), {
      credentials: 'same-origin',
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Sesi operator pilot telah berakhir. Silakan login kembali.');
      }
      const msg = await parseErrorMessage(res, 'Gagal mengunduh PDF bukti simulasi');
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

  async importOperatorJson(file: File, csrfToken: string): Promise<OperatorRawImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const res = await fetch(`${API_BASE}/simulation/operator/import-json`, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: formData,
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Sesi operator pilot tidak valid atau telah berakhir. Silakan login kembali.');
      }
      if (res.status === 403) {
        throw new Error('Akses ditolak: validasi CSRF gagal atau koneksi intranet wajib HTTPS.');
      }
      if (res.status === 413) {
        throw new Error('Ukuran berkas melebihi batas maksimum 2 MiB.');
      }
      if (res.status === 429) {
        throw new Error('Terlalu banyak permintaan impor. Silakan tunggu beberapa saat.');
      }
      const msg = await parseErrorMessage(res, 'Gagal mengimpor berkas JSON SAP');
      throw new Error(msg);
    }

    return res.json();
  },
};
