import { create } from 'zustand';
import { authApi } from '../utils/api/authApi';
import type { UserProfile } from '../types/auth';

interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  csrfToken: string | null;
  isLoading: boolean;
  error: string | null;

  checkAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  csrfToken: null,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const session = await authApi.getCurrentSession();
      if (session.authenticated && session.user) {
        set({
          isAuthenticated: true,
          user: session.user,
          csrfToken: session.csrf_token || null,
          isLoading: false,
        });
      } else {
        set({
          isAuthenticated: false,
          user: null,
          csrfToken: null,
          isLoading: false,
        });
      }
    } catch {
      set({
        isAuthenticated: false,
        user: null,
        csrfToken: null,
        isLoading: false,
      });
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await authApi.login(username, password);
      set({
        isAuthenticated: true,
        user: resp.user,
        csrfToken: resp.csrf_token,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk ke aplikasi.';
      set({
        isAuthenticated: false,
        user: null,
        csrfToken: null,
        isLoading: false,
        error: msg,
      });
      return false;
    }
  },

  logout: async () => {
    const { csrfToken } = get();
    set({ isLoading: true });
    try {
      if (csrfToken) {
        await authApi.logout(csrfToken);
      }
    } catch {
      // Best-effort logout cleanup
    } finally {
      set({
        isAuthenticated: false,
        user: null,
        csrfToken: null,
        isLoading: false,
        error: null,
      });
    }
  },
}));
