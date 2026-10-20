"""Source permission changes and server credential validation."""
from datetime import datetime, timezone
import hashlib
import hmac
import os
from uuid import uuid4
from app.label_intake.policy import AccessKey, credential_digest
from ..errors import ManagementError
from .key_encryption import encrypt

def upsert_source(document, source):
    sources = list(document.policy.sources)
    position = next((i for i, item in enumerate(sources) if item.identity == source.identity), None)
    previous = sources[position] if position is not None else None
    if previous and previous.deleted:
        raise ManagementError('source_exists', 422)
    if previous:
        source = source.model_copy(update={'access_key': previous.access_key,
            'credential_env': source.credential_env or previous.credential_env})
    if source.print_target_id is not None:
        raise ManagementError('invalid_print_route', 422)
    if any(identity not in {t.target_id for t in document.policy.targets} for identity in source.allowed_print_target_ids):
        raise ManagementError('invalid_print_route', 422)
    if source.enabled:
        digest = credential_digest(source)
        if digest is None:
            raise ManagementError('access_key_required', 422)
        ensure_unique(document, source.identity, digest)
    if position is None:
        sources.append(source)
    else:
        sources[position] = source
    document.policy = document.policy.model_copy(update={'sources': tuple(sources)})


def ensure_unique(document, identity, digest):
    for item in document.policy.sources:
        expected = credential_digest(item)
        if item.identity != identity and expected is not None and hmac.compare_digest(expected, digest):
            raise ManagementError('access_key_duplicate', 422)


def change_key(document, identity, action, raw_key=None):
    sources = list(document.policy.sources)
    position = next((i for i, item in enumerate(sources) if item.identity == identity), None)
    if position is None or sources[position].deleted:
        raise ManagementError('source_not_found', 404)
    source = sources[position]
    current = credential_digest(source)
    if action == 'create' and current is not None:
        raise ManagementError('access_key_exists', 422)
    if action == 'rotate' and current is None:
        raise ManagementError('access_key_required', 422)
    if action == 'revoke' and current is None:
        raise ManagementError('access_key_required', 422)
    if action == 'migrate' and (source.access_key is not None or current is None):
        raise ManagementError('legacy_key_unavailable', 422)
    now = datetime.now(timezone.utc)
    digest = (current if action == 'migrate' else
              hashlib.sha256(raw_key.encode('ascii')).digest() if action != 'revoke' else None)
    if digest is not None:
        ensure_unique(document, identity, digest)
    previous = source.access_key
    key_id = previous.key_id if action == 'revoke' and previous else 'K_' + uuid4().hex
    if action == 'migrate':
        raw_key = os.environ.get(source.credential_env, '')
        if not hmac.compare_digest(hashlib.sha256(raw_key.encode('ascii')).digest(), current):
            raise ManagementError('legacy_key_unavailable', 422)
    encrypted = encrypt(raw_key, identity, key_id) if action != 'revoke' else None
    key = AccessKey(key_id=key_id,
                    state='revoked' if action == 'revoke' else 'active',
                    sha256=digest.hex() if digest is not None else None,
                    ciphertext=encrypted,
                    created_at=previous.created_at if action == 'revoke' and previous else now,
                    updated_at=now)
    sources[position] = source.model_copy(update={'access_key': key, 'credential_env': None})
    document.policy = document.policy.model_copy(update={'sources': tuple(sources)})


def delete_source(document, identity):
    sources = list(document.policy.sources)
    position = next((i for i, source in enumerate(sources) if source.identity == identity and not source.deleted), None)
    if position is None:
        raise ManagementError('source_not_found', 404)
    # Retain identity for history; remove credentials without changing audit prefixes.
    sources[position] = sources[position].model_copy(update={
        'deleted': True, 'enabled': False, 'access_key': None, 'credential_env': None,
        'modes': (), 'print_target_id': None, 'allowed_print_target_ids': (),
    })
    document.policy = document.policy.model_copy(update={'sources': tuple(sources)})
