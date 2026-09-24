import { API_BASE } from './apiConfig';
import type { LoginResponse, SessionInfo } from '../../types/auth';

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

export const authApi = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      if (res.status === 403) {
        const msg = await parseErrorMessage(
          res,
          'Akses aplikasi melalui jaringan intranet wajib menggunakan HTTPS.',
        );
        throw new Error(msg);
      }
      if (res.status === 429) {
        const msg = await parseErrorMessage(
          res,
          'Terlalu banyak percobaan login yang gagal. Akun dikunci sementara selama 5 menit.',
        );
        throw new Error(msg);
      }
      const msg = await parseErrorMessage(res, 'Nama pengguna atau kata sandi tidak valid.');
      throw new Error(msg);
    }

    return res.json();
  },

  async logout(csrfToken: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
    });

    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Gagal keluar dari sesi aplikasi.');
      throw new Error(msg);
    }
  },

  async getCurrentSession(): Promise<SessionInfo> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      return { authenticated: false };
    }

    return res.json();
  },

  async getCsrfToken(): Promise<string> {
    const res = await fetch(`${API_BASE}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Gagal mengambil CSRF token.');
    }

    const data = await res.json();
    return data.csrf_token;
  },
};
