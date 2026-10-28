"""Stream admission preserves bounded bytes and request context on every exit."""
import asyncio

import pytest

from app.auth.middleware import AuthenticationMiddleware
from app.auth.service import actor_id
from app.http_body import BodyLimitExceeded, read_bounded_body, replay_body


def test_chunked_body_replayed_once_then_delegates():
    messages = iter([
        {'type': 'http.request', 'body': b'ab', 'more_body': True},
        {'type': 'http.request', 'body': b'cd'},
        {'type': 'http.disconnect'},
    ])

    async def receive():
        return next(messages)

    async def check():
        body = await read_bounded_body(receive, 4)
        accepted = replay_body(body, receive)
        assert await accepted() == {'type': 'http.request', 'body': b'abcd', 'more_body': False}
        assert await accepted() == {'type': 'http.disconnect'}

    asyncio.run(check())


def test_over_limit_rejects_without_consuming_next_chunk():
    messages = iter([
        {'type': 'http.request', 'body': b'abc', 'more_body': True},
        {'type': 'http.request', 'body': b'de', 'more_body': True},
        {'type': 'http.request', 'body': b'untouched'},
    ])

    async def receive():
        return next(messages)

    async def check():
        with pytest.raises(BodyLimitExceeded):
            await read_bounded_body(receive, 4)
        assert (await receive())['body'] == b'untouched'

    asyncio.run(check())


@pytest.mark.parametrize('failure', ['disconnect', 'receive_error', 'downstream_error'])
def test_auth_actor_restored_when_request_stream_or_app_stops(failure):
    calls = []

    async def app(scope, receive, send):
        calls.append(actor_id.get())
        raise RuntimeError('downstream stopped')

    middleware = AuthenticationMiddleware(app)

    async def authorize(request, relative):
        return {'id': 'current-request'}

    middleware.authorize = authorize

    async def receive():
        assert actor_id.get() == 'current-request'
        if failure == 'receive_error':
            raise RuntimeError('stream stopped')
        if failure == 'disconnect':
            return {'type': 'http.disconnect'}
        return {'type': 'http.request', 'body': b'{}'}

    async def send(message):
        raise AssertionError('No response expected')

    async def check():
        token = actor_id.set('outer-request')
        try:
            scope = {'type': 'http', 'path': '/api/v1/auth/login', 'method': 'POST', 'headers': []}
            if failure == 'disconnect':
                await middleware(scope, receive, send)
            else:
                with pytest.raises(RuntimeError):
                    await middleware(scope, receive, send)
            assert actor_id.get() == 'outer-request'
            assert calls == (['current-request'] if failure == 'downstream_error' else [])
        finally:
            actor_id.reset(token)

    asyncio.run(check())
