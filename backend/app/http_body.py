"""Bound an ASGI request before parsing and deliver its accepted bytes once."""


class BodyLimitExceeded(ValueError):
    pass


async def read_bounded_body(receive, limit):
    body = bytearray()
    while True:
        message = await receive()
        if message['type'] == 'http.disconnect':
            return None
        chunk = message.get('body', b'')
        if len(body) + len(chunk) > limit:
            raise BodyLimitExceeded()
        body.extend(chunk)
        if not message.get('more_body', False):
            return bytes(body)


def replay_body(body, receive):
    delivered = False

    async def accepted_body():
        nonlocal delivered
        if delivered:
            return await receive()
        delivered = True
        return {'type': 'http.request', 'body': body, 'more_body': False}

    return accepted_body
