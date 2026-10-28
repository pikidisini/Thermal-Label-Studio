"""Default-deny API policy. Authentication precedes body parsing and effects."""
from app.http_body import BodyLimitExceeded, read_bounded_body, replay_body
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .http import COOKIE, service, transport_access
from .service import AuthError, actor_id, public_user


# Each mounted interactive route/method must declare a policy; additions fail closed.
import re

DESIGN = {'Admin', 'Designer'}
ALL = DESIGN | {'Operator'}
POLICY = [
    (r'/sap-requests(?:/operations|/holds|/[^/]+/history)?', {'GET'}, ALL),
    (r'/sap-requests/[^/]+/physical-check', {'POST'}, ALL),
    (r'/sap-requests/[^/]+/release-hold', {'POST'}, {'Admin'}),
    (r'/sap-requests/printer-holds/[^/]+/physical-check', {'POST'}, ALL),
    (r'/sap-requests/printer-holds/[^/]+/release-hold', {'POST'}, {'Admin'}),
    (r'/auth/session', {'GET'}, ALL),
    (r'/auth/(login|logout|change-password|activity)', {'POST'}, ALL),
    (r'/management/users', {'GET', 'POST'}, {'Admin'}),
    (r'/management/users/[^/]+', {'PATCH'}, {'Admin'}),
    (r'/management/users/[^/]+/reset-password', {'POST'}, {'Admin'}),
    (r'/management/(snapshot|audit|activity|sap-operations)', {'GET'}, {'Admin'}),
    (r'/management/snapshot', {'GET'}, DESIGN),
    (r'/management/(printers|sources|sap-connections|sap-operations)', {'PUT'}, {'Admin'}),
    (r'/management/(printers|sources|sap-connections|sap-operations)/[^/]+', {'DELETE'}, {'Admin'}),
    (r'/management/sources/[^/]+/key', {'POST'}, {'Admin'}),
    (r'/management/sap-operations/[^/]+/(sample|execute)', {'POST'}, {'Admin'}),
    (r'/management/templates/[^/]+', {'POST'}, DESIGN),
    (r'/label-print/(printers|operations)', {'GET'}, ALL),
    (r'/label-print/(preview|print|print-package|printer-status)', {'POST'}, ALL),
    (r'/studio-sample-datasets', {'GET'}, ALL),
    (r'/studio-sample-datasets', {'POST'}, DESIGN),
    (r'/studio-sample-datasets/[^/]+', {'GET', 'PUT'}, DESIGN),
    (r'/layouts', {'GET', 'POST'}, DESIGN),
    (r'/layouts/[^/]+', {'GET', 'PATCH', 'DELETE'}, DESIGN),
    (r'/layouts/[^/]+/versions', {'GET'}, DESIGN),
    (r'/graphics', {'GET', 'POST'}, DESIGN),
    (r'/graphics/[^/]+(?:/content)?', {'GET'}, DESIGN),
    (r'/printing/target', {'GET'}, DESIGN),
    (r'/(?:design/validate|simulation/editor-preview|simulation/fixture|printing/editor|labels/process)', {'POST'}, DESIGN),
]


def permitted(path, method, role):
    if path == '/auth/login' and method == 'POST' and role == '':
        return True  # Only after pre-session, Origin and CSRF checks.
    return any(method in methods and role in roles and re.fullmatch(pattern, path)
               for pattern, methods, roles in POLICY)


class AuthenticationMiddleware:
    def __init__(self, app, api_prefix='/api/v1'):
        self.app, self.prefix = app, api_prefix

    def handles(self, scope):
        if scope['type'] != 'http':
            return False
        path = scope['path']
        return (path != self.prefix + '/label-intake'
                and path != '/api/v2/label-intake'
                and not path.startswith('/api/v2/label-intake/')
                and path.startswith(self.prefix + '/'))

    async def authorize(self, request, relative):
        transport_access(request)
        if relative == '/auth/session' and request.method == 'GET':
            return None
        auth = service(request)
        session, user = await run_in_threadpool(auth.session, request.cookies.get(COOKIE, ''), touch=False)
        if request.method not in {'GET', 'HEAD'}:
            auth.csrf(session, request.headers.get('x-csrf-token', ''))
        if relative != '/auth/login' and not user:
            raise AuthError('unauthenticated', 401)
        if user and user['must_change_password'] and relative not in {'/auth/change-password', '/auth/logout', '/auth/activity'}:
            raise AuthError('password_change_required', 403)
        if not permitted(relative, request.method, user['role'] if user else ''):
            raise AuthError('forbidden', 403)
        request.scope.setdefault('state', {})['auth_user'] = public_user(user) if user else None
        return user

    async def dispatch(self, request, relative, receive, send):
        if request.method not in {'GET', 'HEAD'} and relative.startswith(('/auth/', '/management/users')):
            try:
                body = await read_bounded_body(receive, 16384)
            except BodyLimitExceeded:
                return await JSONResponse({'detail': {'code': 'request_too_large'}}, status_code=413,
                                          headers={'Cache-Control': 'no-store'})(request.scope, receive, send)
            if body is None:
                return
            receive = replay_body(body, receive)

        async def no_store(message):
            if message['type'] == 'http.response.start':
                headers = [(k, v) for k, v in message.get('headers', []) if k.lower() != b'cache-control']
                message['headers'] = headers + [(b'cache-control', b'no-store')]
            await send(message)

        await self.app(request.scope, receive, no_store)

    async def __call__(self, scope, receive, send):
        if not self.handles(scope):
            return await self.app(scope, receive, send)
        request = Request(scope)
        relative = scope['path'][len(self.prefix):]
        try:
            user = await self.authorize(request, relative)
        except AuthError as exc:
            return await JSONResponse({'detail': {'code': exc.code, 'message': 'Authentication or access check failed.'}},
                                      status_code=exc.status, headers={'Cache-Control': 'no-store'})(scope, receive, send)
        token = actor_id.set(user['id'] if user else None)
        try:
            await self.dispatch(request, relative, receive, send)
        finally:
            actor_id.reset(token)
