"""Capture only output routes and safe error codes, including admission failures."""
from datetime import datetime, timezone
import json
import logging
from time import monotonic
from starlette.concurrency import run_in_threadpool
from app.observability import current_request_id
from .context import current_activity, stage, ERROR_CODES
from .store import ActivityUnavailable, configured_activity_store

logger = logging.getLogger('thermal_label_studio.activity')


class ActivityMiddleware:
    def __init__(self, app, api_prefix='/api/v1'):
        self.app = app
        self.routes = {api_prefix + '/label-intake': ('intake', None),
                       api_prefix + '/simulation/editor-preview': ('studio', 'simulation'),
                       api_prefix + '/printing/editor': ('studio', 'print'),
                       api_prefix + '/label-print/preview': ('label_print', 'preview'),
                       api_prefix + '/label-print/print': ('label_print', 'print'),
                       api_prefix + '/label-print/printer-status': ('label_print', 'status')}

    async def __call__(self, scope, receive, send):
        route = self.routes.get(scope.get('path'))
        if scope['type'] != 'http' or scope.get('method') != 'POST' or route is None:
            return await self.app(scope, receive, send)
        try:
            store = configured_activity_store(scope['app'])
        except ActivityUnavailable:
            logger.error('activity_storage_unavailable')
            store = None
        if store is None:
            return await self.app(scope, receive, send)
        activity = dict(trace_id=current_request_id(), at=datetime.now(timezone.utc).isoformat(),
                        origin=route[0], mode=route[1], status='FAILED', events=[], started=monotonic())
        token = current_activity.set(activity)
        status, error_body = None, bytearray()

        async def capture(message):
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
            elif message['type'] == 'http.response.body' and status is not None and status >= 400:
                chunk = message.get('body', b'')
                if len(error_body) + len(chunk) <= 8192:
                    error_body.extend(chunk)
            await send(message)

        stage('REQUEST_RECEIVED')
        try:
            await self.app(scope, receive, capture)
        except Exception:
            activity['error_code'] = 'processing_failed'
            if route[1] == 'print' or activity.get('mode') == 'print':
                # An interrupted response cannot prove that submission did not occur.
                activity['status'] = 'UNCERTAIN'
            raise
        finally:
            activity['status_code'] = status or 500
            if error_body:
                try:
                    detail = json.loads(error_body).get('detail', {})
                    code = detail.get('code') if isinstance(detail, dict) else None
                    if isinstance(code, str) and code in ERROR_CODES:
                        activity['error_code'] = code
                        if code in ('print_submission_uncertain', 'submission_uncertain', 'response_unavailable'):
                            activity['status'] = 'UNCERTAIN'
                except (ValueError, AttributeError):
                    pass
            activity.pop('item_index', None)
            stage('REQUEST_FAILED' if activity['status_code'] >= 400 else 'REQUEST_COMPLETED')
            activity['duration_ms'] = round((monotonic() - activity.pop('started')) * 1000, 2)
            current_activity.reset(token)
            try:
                # Do not replace/retry an already submitted print when logging fails.
                await run_in_threadpool(store.append, activity)
            except Exception:
                logger.error('activity_write_failed trace_id=%s', activity['trace_id'])
