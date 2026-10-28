"""Explicit authenticated clients for feature regressions, using real auth policy.

Only persistence is faked. Authentication rejection/role tests use raw TestClient.
"""
from contextlib import contextmanager
from copy import deepcopy
import os
from threading import RLock
from uuid import uuid4
from weakref import WeakSet

from fastapi.testclient import TestClient as RawClient
from app.auth.service import AuthService, DUMMY_HASH
from app.auth.middleware import AuthenticationMiddleware


class MemoryRepository:
    def __init__(self):
        self.data = {key: {} for key in ('users', 'sessions', 'limits')}
        self.events = []

    def get(self, kind, key):
        return deepcopy(self.data[kind].get(key))

    def put(self, kind, key, value):
        self.data[kind][key] = deepcopy(value)

    def all(self, kind):
        return deepcopy(self.data[kind])

    def delete(self, kind, key):
        self.data[kind].pop(key, None)

    def event(self, value):
        self.events.append(deepcopy(value))


class MemoryStore:
    def __init__(self):
        self.repo, self.lock = MemoryRepository(), RLock()

    @contextmanager
    def transaction(self):
        with self.lock:
            snapshot = deepcopy(self.repo.data), deepcopy(self.repo.events)
            try:
                yield self.repo
            except Exception:
                self.repo.data, self.repo.events = snapshot
                raise


_setup_lock = RLock()
_feature_apps = WeakSet()


def reset_feature_clients():
    """Scope synthetic sessions to a test, avoiding quadratic rollback snapshots."""
    with _setup_lock:
        for app in list(_feature_apps):
            previous = getattr(app.state, '_feature_test_auth', None)
            if previous is not None:
                if getattr(app.state, 'auth_service', None) is previous:
                    del app.state.auth_service
                del app.state._feature_test_auth
        _feature_apps.clear()


class TestClient(RawClient):
    __test__ = False

    def __init__(self, app, *args, **kwargs):
        # Keep synthetic clients aligned with the explicitly configured test
        # origin.  Linux coverage runs the app on port 8000, while local
        # feature tests historically used the loopback origin without a port.
        kwargs.setdefault('base_url', os.environ.get('TLS_TEST_BASE_URL', 'http://127.0.0.1'))
        test_origin = kwargs['base_url'].rstrip('/')
        kwargs.setdefault('client', ('127.0.0.1', 50000))
        with _setup_lock:
            _feature_apps.add(app)
            auth = getattr(app.state, '_feature_test_auth', None)
            if auth is None:
                auth = AuthService(MemoryStore())
                user = dict(id='synthetic-admin', username='synthetic-admin', username_key='synthetic-admin',
                            display_name='Synthetic Admin', role='Admin', active=True,
                            must_change_password=False, password_hash=DUMMY_HASH)
                auth.store.repo.put('users', user['id'], user)
                app.state._feature_test_auth = auth
            app.state.auth_service = auth
            with auth.transaction() as repo:
                token, csrf, _ = auth._new_session(repo, repo.get('users', 'synthetic-admin'))
        guarded = AuthenticationMiddleware(app)
        root_guarded = AuthenticationMiddleware(app, api_prefix='')

        async def application(scope, receive, send):
            scope['app'] = app
            path = scope.get('path', '')
            if path.startswith(('/layouts', '/studio-sample-datasets', '/graphics', '/management/', '/label-print/', '/simulation/', '/printing/', '/design/')):
                await root_guarded(scope, receive, send)
            else:
                await guarded(scope, receive, send)

        super().__init__(application, *args, **kwargs)
        self.app = app  # Preserve feature fixture access; transport retains guarded application.
        self.cookies.set('tls_session', token)
        self.headers.update({'Origin': test_origin, 'X-CSRF-Token': csrf})
