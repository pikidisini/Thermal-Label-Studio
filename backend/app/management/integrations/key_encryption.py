"""Recoverable managed keys; the master key stays outside the database."""
import base64
import hashlib
import hmac
import os
import re
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from ..errors import ManagementError


def cipher():
    try:
        encoded = os.environ.get('TLS_MANAGEMENT_KEY_ENCRYPTION', '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}=?', encoded):
            raise ValueError()
        key = base64.b64decode(encoded + '=' * (-len(encoded) % 4), altchars=b'-_', validate=True)
        if len(key) != 32:
            raise ValueError()
        return AESGCM(key)
    except ValueError:
        raise ManagementError('key_encryption_unavailable', 503) from None


def context(identity, key_id):
    return ('thermal-label-studio/access-key/v1\0' + identity + '\0' + key_id).encode('ascii')


def encrypt(raw_key, identity, key_id):
    nonce = secrets.token_bytes(12)
    encrypted = cipher().encrypt(nonce, raw_key.encode('ascii'), context(identity, key_id))
    return 'v1.' + base64.urlsafe_b64encode(nonce + encrypted).decode('ascii')


def reveal(source):
    key = source.access_key
    if key is None or key.state != 'active' or not key.ciphertext:
        raise ManagementError('key_not_recoverable', 422)
    # Read configuration separately so a missing master has a useful bounded error.
    aes = cipher()
    try:
        if not key.ciphertext.startswith('v1.'):
            raise ValueError()
        payload = base64.b64decode(key.ciphertext[3:], altchars=b'-_', validate=True)
        raw = aes.decrypt(payload[:12], payload[12:], context(source.identity, key.key_id)).decode('ascii')
        if (not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', raw)
                or not hmac.compare_digest(hashlib.sha256(raw.encode('ascii')).hexdigest(), key.sha256)):
            raise ValueError()
        return raw
    except Exception:
        raise ManagementError('key_decryption_failed', 503) from None
