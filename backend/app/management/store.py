"""Shared PostgreSQL snapshot, revision locking and transactional audit."""
from app.auth.service import actor_id
from datetime import datetime, timezone
import json
import os
from uuid import uuid4
from app.label_intake.policy import validate_transition
from .models import Document
from .errors import ManagementError
from .audit.service import audit_view
from app.layouts.service import LayoutConflictError, LayoutNotFoundError


MANAGEMENT_TRANSACTION_OPTIONS = '-c statement_timeout=10000 -c lock_timeout=3000'

class ManagementStore:
    def __init__(self, database_url):
        import psycopg
        self.database, self.database_url = psycopg, database_url

    def read(self):
        try:
            with self.database.connect(self.database_url, connect_timeout=3,
                    options=MANAGEMENT_TRANSACTION_OPTIONS) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT document FROM app_management.management_state WHERE singleton = true')
                    row = cursor.fetchone()
                    if row is None:
                        raise ManagementError()
                    return Document.model_validate_json(json.dumps(row[0]))
        except (ManagementError, LayoutConflictError, LayoutNotFoundError):
            raise
        except Exception:
            raise ManagementError() from None

    def audit(self):
        try:
            with self.database.connect(self.database_url, connect_timeout=3,
                    options=MANAGEMENT_TRANSACTION_OPTIONS) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT event FROM app_management.management_audit ORDER BY sequence DESC LIMIT 200')
                    return [row[0] for row in cursor.fetchall()]
        except Exception:
            raise ManagementError() from None

    def change(self, revision, action, object_id, note, operation, storage_operation=None):
        # A locked snapshot, revision check and audit commit form one transaction.
        # No retry: an acknowledgement failure can follow an actual commit.
        try:
            with self.database.connect(self.database_url, connect_timeout=3,
                    options=MANAGEMENT_TRANSACTION_OPTIONS) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT document FROM app_management.management_state WHERE singleton = true FOR UPDATE')
                    row = cursor.fetchone()
                    if row is None:
                        raise ManagementError()
                    previous = Document.model_validate_json(json.dumps(row[0]))
                    if previous.policy.revision != revision:
                        raise ManagementError('management_conflict', 409)
                    updated = previous.model_copy(deep=True)
                    storage_evidence = storage_operation(cursor) if storage_operation else None
                    operation(updated)
                    updated.policy = updated.policy.model_copy(update={'revision': 'M_' + uuid4().hex})
                    updated = Document.model_validate_json(updated.model_dump_json())
                    if len(updated.model_dump_json().encode('utf-8')) > 2 * 1024 * 1024:
                        raise ManagementError('management_capacity', 409)
                    validate_transition(previous.policy, updated.policy)
                    event = {'event_id': uuid4().hex, 'at': datetime.now(timezone.utc).isoformat(), 'actor': actor_id.get() or 'DEVELOPMENT_UNAUTHENTICATED', 'action': action, 'object_id': object_id, 'note': note, 'revision': updated.policy.revision, 'before': audit_view(previous, action, object_id), 'after': audit_view(updated, action, object_id)}
                    if storage_evidence is not None:
                        event['before'], event['after'] = storage_evidence
                    cursor.execute('UPDATE app_management.management_state SET document = %s::jsonb WHERE singleton = true',
                                   (updated.model_dump_json(),))
                    cursor.execute('INSERT INTO app_management.management_audit(event) VALUES (%s::jsonb)',
                                   (json.dumps(event),))
            return updated
        except (ManagementError, LayoutConflictError, LayoutNotFoundError):
            raise
        except Exception:
            raise ManagementError() from None



def configured_store(request):
    store = getattr(request.app.state, 'management_store', None)
    if store is not None:
        return store
    if os.environ.get('TLS_MANAGEMENT_ENABLED', 'false') == 'false':
        return None
    if os.environ.get('TLS_MANAGEMENT_ENABLED') != 'true':
        raise ManagementError()
    from app.config import get_settings
    settings = get_settings()
    if settings.persistence is None:
        raise ManagementError()
    return ManagementStore(settings.persistence.database_url)
