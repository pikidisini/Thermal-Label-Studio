import test from 'node:test';
import assert from 'node:assert/strict';
import { authApi } from '../src/utils/api/authApi.ts';
import { useAuthStore } from '../src/store/useAuthStore.ts';

function mockResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('authApi.login sends credentials and returns LoginResponse', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return mockResponse({
      body: {
        status: 'authenticated',
        user: { id: 'u1', username: 'ppic_user', role: 'PPIC', is_active: true },
        csrf_token: 'csrf-12345',
        expires_at: '2026-09-24T18:00:00Z',
      },
    });
  };

  try {
    const res = await authApi.login('ppic_user', 'Pass123!');
    assert.equal(captured.url, '/api/v1/auth/login');
    assert.equal(captured.options.method, 'POST');
    assert.equal(captured.options.credentials, 'include');
    assert.equal(captured.body.username, 'ppic_user');
    assert.equal(captured.body.password, 'Pass123!');
    assert.equal(res.user.username, 'ppic_user');
    assert.equal(res.user.role, 'PPIC');
    assert.equal(res.csrf_token, 'csrf-12345');
  } finally {
    global.fetch = originalFetch;
  }
});

test('authApi.login propagates 401, 403, and 429 errors', async () => {
  const originalFetch = global.fetch;

  try {
    // 401
    global.fetch = async () => mockResponse({ ok: false, status: 401, body: { detail: 'Kredensial tidak valid' } });
    await assert.rejects(() => authApi.login('bad', 'bad'), /Kredensial tidak valid/);

    // 403
    global.fetch = async () => mockResponse({ ok: false, status: 403, body: { detail: 'Intranet HTTPS wajib' } });
    await assert.rejects(() => authApi.login('ppic', 'pass'), /Intranet HTTPS wajib/);

    // 429
    global.fetch = async () => mockResponse({ ok: false, status: 429, body: { detail: 'Akun dikunci sementara' } });
    await assert.rejects(() => authApi.login('ppic', 'pass'), /Akun dikunci sementara/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('authApi.logout sends X-CSRF-Token', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return mockResponse({ body: { status: 'logged_out' } });
  };

  try {
    await authApi.logout('csrf-token-abc');
    assert.equal(captured.url, '/api/v1/auth/logout');
    assert.equal(captured.options.method, 'POST');
    assert.equal(captured.options.headers['X-CSRF-Token'], 'csrf-token-abc');
  } finally {
    global.fetch = originalFetch;
  }
});

test('authApi.getCurrentSession returns SessionInfo or unauthenticated', async () => {
  const originalFetch = global.fetch;

  try {
    // Authenticated
    global.fetch = async () =>
      mockResponse({
        body: {
          authenticated: true,
          user: { id: 'u2', username: 'it_admin', role: 'IT', is_active: true },
          csrf_token: 'csrf-it-token',
        },
      });
    const s1 = await authApi.getCurrentSession();
    assert.equal(s1.authenticated, true);
    assert.equal(s1.user.role, 'IT');

    // Unauthenticated (401)
    global.fetch = async () => mockResponse({ ok: false, status: 401 });
    const s2 = await authApi.getCurrentSession();
    assert.equal(s2.authenticated, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('useAuthStore login and logout workflow', async () => {
  const originalFetch = global.fetch;

  try {
    // 1. Initial State
    assert.equal(useAuthStore.getState().isAuthenticated, false);

    // 2. Successful Login
    global.fetch = async () =>
      mockResponse({
        body: {
          status: 'authenticated',
          user: { id: 'u3', username: 'ppic_store', role: 'PPIC', is_active: true },
          csrf_token: 'csrf-store-token',
          expires_at: '2026-09-24T20:00:00Z',
        },
      });

    const success = await useAuthStore.getState().login('ppic_store', 'Pass123!');
    assert.equal(success, true);
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(useAuthStore.getState().user.username, 'ppic_store');
    assert.equal(useAuthStore.getState().csrfToken, 'csrf-store-token');

    // 3. Logout
    global.fetch = async () => mockResponse({ body: { status: 'logged_out' } });
    await useAuthStore.getState().logout();
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().user, null);
    assert.equal(useAuthStore.getState().csrfToken, null);
  } finally {
    global.fetch = originalFetch;
  }
});
