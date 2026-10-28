"""Versioned authenticated encryption. No keys or business data in repr/errors."""
import base64
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class PayloadKeys:
    def __init__(self, active, keys):
        if active not in keys or not keys or any(len(key) != 32 for key in keys.values()):
            raise ValueError('Invalid queue encryption configuration.')
        self.active, self._keys = active, dict(keys)

    def seal(self, value, context):
        raw = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
        if len(raw) > 3 * 1024 * 1024 - 28:
            raise ValueError('Queue payload exceeds the storage budget.')
        nonce = os.urandom(12)
        return self.active, nonce + AESGCM(self._keys[self.active]).encrypt(nonce, raw, context.encode())

    def open(self, version, ciphertext, context):
        try:
            raw = AESGCM(self._keys[version]).decrypt(bytes(ciphertext[:12]), bytes(ciphertext[12:]), context.encode())
            return json.loads(raw)
        except Exception:
            raise ValueError('Queue payload is unavailable.') from None

    @classmethod
    def environment(cls, values):
        try:
            config = json.loads(values['TLS_QUEUE_KEYS_JSON'])
            if set(config) != {'active', 'keys'} or not 1 <= len(config['keys']) <= 32:
                raise ValueError()
            keys = {}
            for version, reference in config['keys'].items():
                if not reference.startswith('TLS_QUEUE_KEY_') or not version.isascii() or not 1 <= len(version) <= 128:
                    raise ValueError()
                encoded = values[reference]
                key = base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4))
                if base64.urlsafe_b64encode(key).decode().rstrip('=') != encoded:
                    raise ValueError()
                keys[version] = key
            return cls(config['active'], keys)
        except Exception:
            raise ValueError('Invalid queue encryption configuration.') from None
