"""Canonical request identity; secrets and raw business values are never retained."""
import hashlib
import hmac
import json
from types import MappingProxyType
from app.label_data.validation import identity
from app.label_data.numbers import number_text
from .results import IntakeAdmissionError, IntakeRequest


def canonical_json(value):
    if value is None:
        return 'null'
    if type(value) is bool:
        return 'true' if value else 'false'
    if type(value) in (int, float):
        return number_text(value)
    if type(value) is str:
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    if type(value) is list:
        return '[' + ','.join(canonical_json(v) for v in value) + ']'
    if type(value) is dict:
        keys = sorted(value, key=lambda key: key.encode('utf-16-be'))
        return '{' + ','.join(canonical_json(k) + ':' + canonical_json(value[k]) for k in keys) + '}'
    raise ValueError('Invalid canonical value.')


class LedgerKeys:
    """Server-injected versioned HMAC keyring; repr never exposes key material."""
    def __init__(self, active: str, keys: dict[str, bytes]):
        identity(active)
        if active not in keys or not keys:
            raise ValueError('Invalid ledger keyring.')
        for version, secret in keys.items():
            identity(version)
            if type(secret) is not bytes or len(secret) < 32:
                raise ValueError('Invalid ledger keyring.')
        self.active, self._keys = active, MappingProxyType(dict(keys))

    def versions(self):
        return frozenset(self._keys)

    def mac(self, version, domain, value):
        return hmac.new(self._keys[version], domain + value, hashlib.sha256).hexdigest()

    def values(self, sender, request):
        request = IntakeRequest.model_validate(request.model_dump())
        identity(sender)
        if sender != request.sender['system']:
            raise IntakeAdmissionError(403, 'sender_not_allowed')
        raw = canonical_json(request.model_dump()).encode('utf-8')
        identity_bytes = canonical_json([sender, request.request_id]).encode('utf-8')
        return {version: (self.mac(version, b'intake-identity-v1\0', identity_bytes),
                          self.mac(version, b'intake-payload-v1\0', raw)) for version in self._keys}
