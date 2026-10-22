import test from 'node:test';
import assert from 'node:assert/strict';
import { authFetch, setSession, clearAccount, currentAccount, validPassword, readSession } from '../src/shared/auth/client.ts';
import { studioPrintLocked, lockStudioPrint, clearStudioPrint } from '../src/features/printing/model/studioPrintLock.ts';

test('interactive requests attach in-memory CSRF without forwarding it to other origins', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; clearAccount(); });
  const calls = [];
  globalThis.fetch = async (input, init) => { calls.push({ input, init }); return new Response('{}'); };
  setSession({ user: { id: 'alice', role: 'Designer' }, csrf_token: 'synthetic', expires_at: 123, idle_expires_at: 123 });
  await authFetch('/api/v1/layouts', { method: 'POST', body: '{}' });
  assert.equal(new Headers(calls[0].init.headers).get('X-CSRF-Token'), 'synthetic');
  assert.equal(calls[0].init.credentials, 'same-origin');
  await authFetch('http://127.0.0.1:17891/v1/jobs', { method: 'POST', credentials: 'omit' });
  assert.equal(new Headers(calls[1].init.headers).has('X-CSRF-Token'), false);
  assert.equal(calls[1].init.credentials, 'omit');
});

test('401 dispatches session expiry once and never retries the rejected write', async t => {
  const original = globalThis.fetch; const previousWindow = globalThis.window;
  t.after(() => { globalThis.fetch = original; globalThis.window = previousWindow; clearAccount(); });
  let calls = 0; let expired = 0;
  globalThis.window = { dispatchEvent: event => { assert.equal(event.type, 'auth:expired'); expired++; } };
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 401 }); };
  assert.equal((await authFetch('/api/v1/label-print/print', { method: 'POST', body: '{}' })).status, 401);
  assert.equal(calls, 1); assert.equal(expired, 1);
});

test('clearing an account does not clear a pending physical-print lock', t => {
  const previous = globalThis.sessionStorage; const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  t.after(() => { globalThis.sessionStorage = previous; clearAccount(); });
  lockStudioPrint(); clearAccount();
  assert.equal(currentAccount(), null); assert.equal(studioPrintLocked(), true);
  clearStudioPrint(); assert.equal(studioPrintLocked(), false);
});


test('Unicode password limits count code points without trimming or truncation', () => {
  assert.equal(validPassword('😀'.repeat(6)), false);
  assert.equal(validPassword('😀'.repeat(7)), true);
  assert.equal(validPassword('x'.repeat(7)), true);
  assert.equal(validPassword('😀'.repeat(128)), true);
  assert.equal(validPassword('😀'.repeat(129)), false);
  assert.equal(validPassword(' '.repeat(7)), true);
});

test('concurrent session reads share one pre-login cookie request', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ user: null, csrf_token: 'synthetic', expires_at: 123, idle_expires_at: 123 })); };
  const [first, second] = await Promise.all([readSession(), readSession()]);
  assert.equal(calls, 1); assert.equal(first.csrf_token, second.csrf_token);
});
