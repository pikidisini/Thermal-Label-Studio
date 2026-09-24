import { useAuthStore } from '../../store/useAuthStore';
import { authApi } from './authApi';

export function getCsrfHeaders(): Record<string, string> {
  const token = useAuthStore.getState().csrfToken;
  return token ? { 'X-CSRF-Token': token } : {};
}

export async function ensureCsrfToken(): Promise<string | null> {
  let token = useAuthStore.getState().csrfToken;
  if (!token) {
    try {
      token = await authApi.getCsrfToken();
      useAuthStore.setState({ csrfToken: token });
    } catch {
      return null;
    }
  }
  return token;
}
