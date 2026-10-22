"""Default-deny API policy. Authentication precedes body parsing and effects."""
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

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        path = scope['path']
        # Intake alone authenticates machine identities using its existing bearer policy.
        if path == self.prefix + '/label-intake' or not path.startswith(self.prefix + '/'):
            return await self.app(scope, receive, send)
        request = Request(scope)
        user = None
        try:
            transport_access(request)
            relative = path[len(self.prefix):]
            if relative != '/auth/session' or request.method != 'GET':
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
                scope.setdefault('state', {})['auth_user'] = public_user(user) if user else None
        except AuthError as exc:
            return await JSONResponse({'detail': {'code': exc.code, 'message': 'Authentication or access check failed.'}},
                                      status_code=exc.status, headers={'Cache-Control': 'no-store'})(scope, receive, send)
        token = actor_id.set(user['id'] if user else None)
        if request.method not in {'GET', 'HEAD'} and (relative.startswith('/auth/') or relative.startswith('/management/users')):
            body = bytearray()
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    actor_id.reset(token)
                    return
                body.extend(message.get('body', b''))
                if len(body) > 16384:
                    actor_id.reset(token)
                    return await JSONResponse({'detail': {'code': 'request_too_large'}}, status_code=413,
                                              headers={'Cache-Control': 'no-store'})(scope, receive, send)
                if not message.get('more_body', False):
                    break
            original_receive = receive
            delivered = False

            async def bounded_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                return await original_receive()
            receive = bounded_receive

        async def no_store(message):
            if message['type'] == 'http.response.start':
                headers = [(k, v) for k, v in message.get('headers', []) if k.lower() != b'cache-control']
                message['headers'] = headers + [(b'cache-control', b'no-store')]
            await send(message)

        try:
            await self.app(scope, receive, no_store)
        finally:
            actor_id.reset(token)
