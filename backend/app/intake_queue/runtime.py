"""Construction only; no connection, migration, key generation or worker startup."""
import os
from functools import lru_cache
from app.label_intake.runtime import create_runtime_ledger
from .crypto import PayloadKeys
from .store import QueueStore


def create_queue(environment=None):
    values = os.environ if environment is None else environment
    enabled = values.get('TLS_QUEUE_ENABLED', 'false')
    if enabled not in ('true','false'):
        raise ValueError('Invalid queue configuration.')
    if enabled == 'false':
        return None
    if values.get('TLS_MANAGEMENT_ENABLED','false') != 'true':
        raise ValueError('Queue requires persisted Management policy and audit history.')
    ledger = create_runtime_ledger(values)
    if ledger is None:
        raise ValueError('Queue requires the durable ledger.')
    return QueueStore(ledger, PayloadKeys.environment(values))


@lru_cache(maxsize=1)
def transport_queue():
    return create_queue()


def current_policy():
    from app.config import get_settings
    from app.management.store import ManagementStore
    from app.label_intake.policy import load_policy
    if os.environ.get('TLS_MANAGEMENT_ENABLED','false').lower() == 'true':
        settings = get_settings()
        if settings.persistence is None:
            raise ValueError('Management persistence is required.')
        return ManagementStore(settings.persistence.database_url).read().policy
    return load_policy()
