"""Explicit ledger wiring only; no driver import, connection or schema at startup."""
import base64
import json
import os
from typing import Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field
from .identity import LedgerKeys
from .ledger import PostgresLedger


class LedgerConfiguration(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, frozen=True)
    database_env: Literal['TLS_INTAKE_DATABASE_URL']
    active_key: str = Field(min_length=1, max_length=128)
    keys: dict[str, str] = Field(min_length=1, max_length=32)


def unique_members(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def resolve_keys(config, values):
    keys = {}
    refs = set()
    for version, reference in config.keys.items():
        if (not reference.startswith('TLS_INTAKE_HMAC_') or len(reference) <= len('TLS_INTAKE_HMAC_')
                or len(reference) > 128 or reference in refs
                or not all(char in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_' for char in reference)):
            raise ValueError()
        refs.add(reference)
        encoded = values.get(reference, '')
        if (not isinstance(encoded, str) or not 43 <= len(encoded) <= 86
                or not all(char in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_' for char in encoded)):
            raise ValueError()
        secret = base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4))
        if (not 32 <= len(secret) <= 64
                or base64.urlsafe_b64encode(secret).decode('ascii').rstrip('=') != encoded):
            raise ValueError()
        keys[version] = secret
    return LedgerKeys(config.active_key, keys)


def create_runtime_ledger(environment=None):
    """Opt-in keyring and dedicated DSN. Missing/invalid config never enables fallback.

    Secrets are resolved from explicit environment references, not inline JSON.
    Old HMAC versions must remain provisioned for permanent tombstones. Actual
    operations require a separately authorized, already-applied ledger schema.
    """
    values = os.environ if environment is None else environment
    raw = values.get('TLS_INTAKE_LEDGER_JSON', '')
    if raw == '':
        return None
    try:
        if not isinstance(raw, str) or len(raw.encode('utf-8')) > 16384:
            raise ValueError()
        config = LedgerConfiguration.model_validate(json.loads(raw, object_pairs_hook=unique_members))
        dsn = values.get(config.database_env, '')
        parsed = urlsplit(dsn)
        if (parsed.scheme not in ('postgres', 'postgresql') or not parsed.hostname
                or not parsed.path.strip('/') or parsed.fragment):
            raise ValueError()
        # Force parsing of an invalid port before the connection factory exists.
        parsed.port
        keyring = resolve_keys(config, values)
    except Exception:
        # Never expose validation input, DSN, credential material or private paths.
        raise ValueError('Invalid intake ledger configuration.') from None

    def connect():
        import psycopg
        return psycopg.connect(dsn, autocommit=False, connect_timeout=3,
                               options='-c statement_timeout=10000 -c lock_timeout=3000')

    return PostgresLedger(connect, keyring)
