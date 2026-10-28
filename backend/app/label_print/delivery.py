"""Convert server-generated readable IPL to device control bytes before LAN delivery."""
import re


def wire_payload(payload: bytes) -> bytes:
    try:
        source = payload.decode('ascii')
        if any(not 32 <= ord(c) <= 126 and c not in '\r\n' for c in source):
            raise ValueError()
        if not source.startswith('<STX><ESC>C<ETX>\r\n') or not source.endswith('<STX><ETB><ETX>\r\n'):
            raise ValueError()
        if len(re.findall(r'<STX><RS>[1-9]\d{0,2}<ETX>', source, flags=re.ASCII)) != 1:
            raise ValueError()
        for name, number in {'STX': 2, 'ETX': 3, 'ESC': 27, 'DEL': 127, 'CAN': 24, 'RS': 30, 'US': 31, 'ETB': 23}.items():
            source = source.replace('<' + name + '>', chr(number))
        if '<' in source or '>' in source:
            raise ValueError()
        return source.encode('ascii')
    except ValueError:
        raise ValueError('Invalid server print payload.') from None
