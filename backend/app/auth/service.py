"""Account lifecycle and session policy, independent of HTTP and transport."""
from contextlib import contextmanager
from contextvars import ContextVar
import hashlib
import secrets
import time
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError

actor_id = ContextVar('authenticated_actor', default=None)
ROLES = {'Admin', 'Designer', 'Operator'}
hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)


class AuthError(Exception):
    def __init__(self, code='authentication_unavailable', status=503):
        self.code, self.status = code, status


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def password_hash(value):
    if not isinstance(value, str) or not 7 <= len(value) <= 128:
        raise AuthError('invalid_password', 422)
    return hasher.hash(value)


def username_key(value):
    if (not isinstance(value, str) or not 1 <= len(value) <= 64 or value != value.strip()
            or any(not (c.isascii() and (c.isalnum() or c in '._-')) for c in value)):
        raise AuthError('invalid_username', 422)
    return value.lower()


def public_user(user):
    return {key: user[key] for key in ('id', 'username', 'display_name', 'role', 'active', 'must_change_password')}


class AuthService:
    def __init__(self, store, clock=time.time):
        self.store, self.clock = store, clock

    @contextmanager
    def transaction(self):
        try:
            with self.store.transaction() as repo:
                yield repo
        except AuthError:
            raise
        except Exception:
            raise AuthError() from None

    def event(self, repo, action, actor=None, target=None):
        repo.event({'at': self.clock(), 'action': action, 'actor': actor, 'target': target})

    def _new_session(self, repo, user=None):
        now = self.clock()
        # Expired sessions and throttling buckets are disposable, unlike audit history.
        for key, session in repo.all('sessions').items():
            if session['expires'] <= now or session['last_seen'] + 1800 <= now:
                repo.delete('sessions', key)
        if len(repo.all('sessions')) >= 10000:
            raise AuthError('session_capacity', 503)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        session = {'user_id': user['id'] if user else None, 'csrf_hash': digest(csrf),
                   'csrf_token': csrf, 'created': now, 'last_seen': now, 'expires': now + (43200 if user else 900)}
        repo.put('sessions', digest(token), session)
        return token, csrf, session

    def session(self, token, *, touch=True):
        with self.transaction() as repo:
            session = repo.get('sessions', digest(token)) if token else None
            now = self.clock()
            if not session or session['expires'] <= now or session['last_seen'] + 1800 <= now:
                raise AuthError('unauthenticated', 401)
            user = repo.get('users', session['user_id']) if session['user_id'] else None
            if session['user_id'] and (not user or not user['active']):
                raise AuthError('unauthenticated', 401)
            if touch and user:
                session['last_seen'] = now
                repo.put('sessions', digest(token), session)
            return session, user

    def initial_session(self):
        with self.transaction() as repo:
            return self._new_session(repo)

    def csrf(self, session, value):
        if not value or not secrets.compare_digest(session['csrf_hash'], digest(value)):
            raise AuthError('csrf_rejected', 403)

    def require_session(self, repo, token, identity=None):
        session = repo.get('sessions', digest(token))
        now = self.clock()
        if (not session or session['expires'] <= now or session['last_seen'] + 1800 <= now
                or (identity is not None and session['user_id'] != identity)):
            raise AuthError('unauthenticated', 401)
        return session

    def require_admin(self, repo, actor):
        if actor is None or actor in {'OFFLINE_BOOTSTRAP', 'OFFLINE_RECOVERY'}:
            return  # Only CLI/test callers omit the HTTP-authenticated actor.
        user = repo.get('users', actor)
        if not user or not user['active'] or user['role'] != 'Admin' or user['must_change_password']:
            raise AuthError('forbidden', 403)

    def _login_buckets(self, repo, username, ip, now):
        for key, bucket in repo.all('limits').items():
            if bucket['until'] <= now:
                repo.delete('limits', key)
        try:
            name = username_key(username)
        except AuthError:
            name = ''
        keys = ['u:' + digest(name), 'ip:' + digest(ip)]
        buckets = [repo.get('limits', key) or {'count': 0, 'until': now + 900} for key in keys]
        return name, keys, buckets

    def _failed_login(self, repo, keys, buckets, now):
        for index, (key, bucket) in enumerate(zip(keys, buckets)):
            bucket['count'] += 1
            if bucket['count'] == (5 if index == 0 else 30):
                bucket['until'] = now + 900
            repo.put('limits', key, bucket)
        self.event(repo, 'login.failed')
        return AuthError('invalid_credentials', 401)

    @staticmethod
    def _valid_password(user, password):
        # Unknown accounts still execute the same password verification algorithm.
        try:
            return hasher.verify(user['password_hash'] if user else DUMMY_HASH, password)
        except (VerificationError, InvalidHashError):
            return False

    def login(self, token, username, password, ip):
        failure = None
        result = None
        with self.transaction() as repo:
            now = self.clock()
            self.require_session(repo, token)
            name, keys, buckets = self._login_buckets(repo, username, ip, now)
            if buckets[0]['count'] >= 5 or buckets[1]['count'] >= 30:
                failure = AuthError('login_throttled', 429)
            else:
                user = next((u for u in repo.all('users').values() if u['username_key'] == name), None)
                valid = self._valid_password(user, password)
                if not valid or not user or not user['active']:
                    failure = self._failed_login(repo, keys, buckets, now)
                else:
                    repo.delete('limits', keys[0])
                    repo.delete('sessions', digest(token))
                    result = (*self._new_session(repo, user), public_user(user))
                    self.event(repo, 'login.succeeded', user['id'])
        # Failed attempts must commit before returning the public error.
        if failure:
            raise failure
        return result

    def revoke(self, repo, identity):
        for key, session in repo.all('sessions').items():
            if session['user_id'] == identity:
                repo.delete('sessions', key)

    def logout(self, token, identity):
        with self.transaction() as repo:
            repo.delete('sessions', digest(token))
            self.event(repo, 'logout', identity)

    def change_password(self, token, identity, current, password):
        if password == current:
            raise AuthError('password_reuse', 422)
        encoded = password_hash(password)
        with self.transaction() as repo:
            self.require_session(repo, token, identity)
            user = repo.get('users', identity)
            try:
                if not user or not hasher.verify(user['password_hash'], current):
                    raise AuthError('invalid_credentials', 401)
            except (VerificationError, InvalidHashError):
                raise AuthError('invalid_credentials', 401) from None
            user.update(password_hash=encoded, must_change_password=False)
            repo.put('users', identity, user)
            self.revoke(repo, identity)
            self.event(repo, 'password.changed', identity)
            return (*self._new_session(repo, user), public_user(user))

    def list_users(self):
        with self.transaction() as repo:
            return [public_user(u) for u in repo.all('users').values()]

    def create_user(self, username, display_name, role, password, actor=None, *, bootstrap=False):
        name, encoded = username_key(username), password_hash(password)
        if role not in ROLES or not display_name.strip() or len(display_name) > 128:
            raise AuthError('invalid_user', 422)
        with self.transaction() as repo:
            self.require_admin(repo, actor)
            users = repo.all('users')
            if bootstrap and users:
                raise AuthError('bootstrap_unavailable', 409)
            if any(u['username_key'] == name for u in users.values()):
                raise AuthError('username_exists', 409)
            if len(users) >= 1000:
                raise AuthError('account_capacity', 409)
            user = {'id': uuid4().hex, 'username': username, 'username_key': name, 'display_name': display_name.strip(), 'role': role, 'active': True, 'must_change_password': True, 'password_hash': encoded}
            repo.put('users', user['id'], user)
            self.event(repo, 'account.created', actor, user['id'])
            return public_user(user)

    def update_user(self, identity, changes, actor=None):
        changes = dict(changes)
        if 'password' in changes:
            changes['password_hash'] = password_hash(changes.pop('password'))
            changes['must_change_password'] = True
        with self.transaction() as repo:
            self.require_admin(repo, actor)
            users = repo.all('users')
            old = users.get(identity)
            if old is None:
                raise AuthError('user_not_found', 404)
            updated = {**old, **changes}
            if updated['role'] not in ROLES or not updated['display_name'].strip():
                raise AuthError('invalid_user', 422)
            if old['role'] == 'Admin' and old['active'] and (updated['role'] != 'Admin' or not updated['active']):
                if not any(u['id'] != identity and u['active'] and u['role'] == 'Admin' for u in users.values()):
                    raise AuthError('last_admin', 409)
            repo.put('users', identity, updated)
            if any(key in changes and changes[key] != old[key] for key in ('role', 'active', 'password_hash')):
                self.revoke(repo, identity)
            self.event(repo, 'account.updated', actor, identity)
            return public_user(updated)


DUMMY_HASH = hasher.hash('dummy verification value without account')
