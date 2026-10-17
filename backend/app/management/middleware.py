"""Shared request admission for all management commands."""
import json
from fastapi.responses import JSONResponse

class ManagementBodyMiddleware:
    """Bound commands and reject duplicate JSON members before framework parsing."""
    def __init__(self, app, prefix='/api/v1/management'):
        self.app, self.prefix = app, prefix

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope.get('path', '').startswith(self.prefix + '/') or scope.get('method') not in ('POST', 'PUT'):
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body.extend(message.get('body', b''))
            if len(body) > 256 * 1024:
                return await JSONResponse(status_code=413, content={'detail': {'code': 'management_body_too_large', 'message': 'Management command exceeds its size limit.'}})(scope, receive, send)
            if not message.get('more_body', False):
                break
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError()
                result[key] = value
            return result
        try:
            json.loads(bytes(body), object_pairs_hook=unique)
        except (ValueError, RecursionError, UnicodeError):
            return await JSONResponse(status_code=400, content={'detail': {'code': 'invalid_management_json', 'message': 'Invalid or duplicate management JSON members.'}})(scope, receive, send)
        delivered = False
        async def replay():
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
        return await self.app(scope, replay, send)
