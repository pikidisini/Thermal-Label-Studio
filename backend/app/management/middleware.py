"""Shared request admission for all management commands."""
from app.http_body import BodyLimitExceeded, read_bounded_body, replay_body
import json
from fastapi.responses import JSONResponse

def unique_members(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


class ManagementBodyMiddleware:
    """Bound commands and reject duplicate JSON members before framework parsing."""

    def __init__(self, app, prefix='/api/v1/management'):
        self.app, self.prefix = app, prefix

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope.get('path', '').startswith(self.prefix + '/') or scope.get('method') not in ('POST', 'PUT'):
            return await self.app(scope, receive, send)
        try:
            body = await read_bounded_body(receive, 256 * 1024)
        except BodyLimitExceeded:
            return await JSONResponse(status_code=413, content={'detail': {'code': 'management_body_too_large', 'message': 'Management command exceeds its size limit.'}})(scope, receive, send)
        if body is None:
            return
        try:
            json.loads(body, object_pairs_hook=unique_members)
        except (ValueError, RecursionError):
            return await JSONResponse(status_code=400, content={'detail': {'code': 'invalid_management_json', 'message': 'Invalid or duplicate management JSON members.'}})(scope, receive, send)
        return await self.app(scope, replay_body(body, receive), send)
