import './setup_dom_mock.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import React from 'react';
import App from '../src/App';
import { useAuthStore } from '../src/store/useAuthStore';

// In Node SSR test runner, ensure useSyncExternalStore evaluates current client state (getSnapshot)
React.useSyncExternalStore = (_subscribe, getSnapshot, _getServerSnapshot) => getSnapshot();

const require = createRequire(import.meta.url);
const { renderToPipeableStream } = require('../node_modules/react-dom/cjs/react-dom-server.node.development.js');

function renderComponentToString(element) {
  return new Promise((resolve, reject) => {
    let html = '';
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString();
        callback();
      },
    });
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(writable);
        resolve(html);
      },
      onError(err) {
        reject(err);
      },
    });
  });
}

test('App Component Lifecycle: loading -> login -> authenticated studio -> logout', async (t) => {
  const originalFetch = global.fetch;

  t.afterEach(() => {
    global.fetch = originalFetch;
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      csrfToken: null,
    });
  });

  await t.test('1. Initial loading state renders auth loading spinner', async () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      csrfToken: null,
    });

    const html = await renderComponentToString(React.createElement(App));
    assert.ok(html.includes('data-testid="app-auth-loading"'), 'Must render loading container');
    assert.ok(html.includes('Memverifikasi sesi aplikasi...'), 'Must render loading message');
    assert.ok(!html.includes('data-testid="login-page"'), 'Must not render login page while loading');
    assert.ok(!html.includes('data-testid="app-root-container"'), 'Must not render studio while loading');
  });

  await t.test('2. Unauthenticated state renders LoginPage', async () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      csrfToken: null,
    });

    const html = await renderComponentToString(React.createElement(App));
    assert.ok(html.includes('data-testid="login-page"'), 'Must render login page');
    assert.ok(html.includes('Thermal Label Studio'), 'Must render login heading');
    assert.ok(html.includes('data-testid="btn-login"'), 'Must render login button');
    assert.ok(html.includes('Masuk ke Studio'), 'Must render login button text');
    assert.ok(!html.includes('data-testid="app-auth-loading"'), 'Must not render loading container');
    assert.ok(!html.includes('data-testid="app-root-container"'), 'Must not render studio container');
  });

  await t.test('3. Authenticated PPIC state renders AuthenticatedStudio with user badge and logout button', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u-1', username: 'ppic_operator', role: 'PPIC', is_active: true },
      csrfToken: 'csrf-ppic-token-999',
    });

    const html = await renderComponentToString(React.createElement(App));
    assert.ok(html.includes('data-testid="app-root-container"'), 'Must render studio root container');
    assert.ok(html.includes('data-testid="container-app-workspace-body"'), 'Must render studio workspace body');
    assert.ok(html.includes('ppic_operator'), 'Must display username in TopMenuBar');
    assert.ok(html.includes('PPIC'), 'Must display PPIC role badge in TopMenuBar');
    assert.ok(html.includes('Keluar'), 'Must display global logout button');
    assert.ok(!html.includes('data-testid="login-page"'), 'Must not render login page');
  });

  await t.test('4. Authenticated IT state renders AuthenticatedStudio with IT badge', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u-2', username: 'it_supervisor', role: 'IT', is_active: true },
      csrfToken: 'csrf-it-token-888',
    });

    const html = await renderComponentToString(React.createElement(App));
    assert.ok(html.includes('data-testid="app-root-container"'), 'Must render studio root container');
    assert.ok(html.includes('it_supervisor'), 'Must display IT username');
    assert.ok(html.includes('IT'), 'Must display IT role badge');
  });

  await t.test('5. Full Transition Lifecycle without React hook order error', async () => {
    // Step A: Loading
    useAuthStore.setState({ isAuthenticated: false, isLoading: true, user: null, csrfToken: null });
    const html1 = await renderComponentToString(React.createElement(App));
    assert.ok(html1.includes('data-testid="app-auth-loading"'));

    // Step B: Unauthenticated
    useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null, csrfToken: null });
    const html2 = await renderComponentToString(React.createElement(App));
    assert.ok(html2.includes('data-testid="login-page"'));

    // Step C: Authenticated
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u-3', username: 'ppic_lead', role: 'PPIC', is_active: true },
      csrfToken: 'csrf-trans-token',
    });
    const html3 = await renderComponentToString(React.createElement(App));
    assert.ok(html3.includes('data-testid="app-root-container"'));
    assert.ok(html3.includes('ppic_lead'));

    // Step D: Logout
    useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null, csrfToken: null });
    const html4 = await renderComponentToString(React.createElement(App));
    assert.ok(html4.includes('data-testid="login-page"'));
  });
});
