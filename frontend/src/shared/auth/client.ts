import { useSyncExternalStore } from 'react';

export type Role = 'Admin' | 'Designer' | 'Operator';
export interface Account { id: string; username: string; display_name: string; role: Role; active: boolean; must_change_password: boolean }
export interface Session { user: Account | null; csrf_token: string; expires_at: number; idle_expires_at: number }
let session: Session | null = null;
let readingSession: Promise<Session> | null = null;
const listeners = new Set<() => void>();
export const currentAccount = () => session?.user ?? null;
export const validPassword = (value: string) => { const length = Array.from(value).length; return length >= 7 && length <= 128; };
export function useAccount() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, currentAccount); }
export function setSession(value: Session) { session = value; listeners.forEach(listener => listener()); }
export function clearAccount() { session = null; listeners.forEach(listener => listener()); }

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const origin = globalThis.location?.origin ?? 'http://localhost';
  const url = new URL(input instanceof Request ? input.url : String(input), origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/v1/')) return globalThis.fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (!['GET', 'HEAD'].includes(method) && session?.csrf_token) headers.set('X-CSRF-Token', session.csrf_token);
  const response = await globalThis.fetch(input, { ...init, headers, credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
  if (!url.pathname.startsWith('/api/v1/auth/') && response.status === 401) globalThis.window?.dispatchEvent(new Event('auth:expired'));
  return response;
}

export async function authCommand(path: string, body?: unknown, method = 'POST'): Promise<Session> {
  const response = await authFetch(`/api/v1/auth/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    if (response.status === 429) throw new Error('Too many login attempts. Try again in 15 minutes.');
    if (response.status === 503) throw new Error('Account storage is unavailable. Contact the administrator.');
    if (path === 'change-password' && response.status === 422) {
      const value = await response.json().catch(() => null);
      if (value?.detail?.code === 'password_reuse') throw new Error('Choose a password different from your current password.');
    }
    throw new Error('The request was rejected. Check your credentials and access.');
  }
  return response.json() as Promise<Session>;
}

export function readSession(): Promise<Session> {
  // StrictMode remounts must share the initial pre-login cookie/CSRF pair.
  if (!readingSession) readingSession = authCommand('session', undefined, 'GET').finally(() => { readingSession = null; });
  return readingSession;
}
