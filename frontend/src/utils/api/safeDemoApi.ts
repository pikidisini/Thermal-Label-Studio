import { API_BASE } from './apiConfig';
import { getCsrfHeaders } from './csrfHelper';
import type { SafeDemoBatch, SafeDemoStatus } from '../../types/safeDemo';

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === 'string') {
      return data.detail;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return fallback;
}

export const safeDemoApi = {
  async getBatch(): Promise<SafeDemoBatch> {
    const res = await fetch(`${API_BASE}/safe-demo/batch`, {
      credentials: 'same-origin',
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Safe Demo Mode dinonaktifkan di backend (SAFE_DEMO_MODE != true).');
      }
      const msg = await parseErrorMessage(res, 'Gagal mengambil data batch demo');
      throw new Error(msg);
    }
    return res.json();
  },

  async getStatus(): Promise<SafeDemoStatus> {
    const res = await fetch(`${API_BASE}/safe-demo/status`, {
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Gagal mengambil status demo');
      throw new Error(msg);
    }
    return res.json();
  },

  async runDemo(): Promise<SafeDemoBatch> {
    const res = await fetch(`${API_BASE}/safe-demo/run`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
    });
    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Simulasi demo mengalami kendala');
      throw new Error(msg);
    }
    return res.json();
  },

  async resetDemo(): Promise<{ status: string; message: string; batch: SafeDemoBatch }> {
    const res = await fetch(`${API_BASE}/safe-demo/reset`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
    });
    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Gagal mereset state demo');
      throw new Error(msg);
    }
    return res.json();
  },

  async checkEnabled(): Promise<boolean> {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        return Boolean(data && data.safe_demo_mode === true);
      }
    } catch {
      // Fail-closed on network or parsing error
    }
    return false;
  },
};
