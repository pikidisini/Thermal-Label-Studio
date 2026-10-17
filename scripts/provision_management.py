"""Explicit management schema/seed provisioning; never run by app startup."""
import argparse
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--confirm-host')
    parser.add_argument('--confirm-database')
    args = parser.parse_args()
    schema = ROOT / 'backend/schema/003_management.sql'
    if not args.apply:
        print('PLAN ONLY: apply 003_management.sql in app_management and seed only a missing snapshot. No connection made.')
        return 0
    from app.management.models import Document
    from app.management.overview.service import empty_document
    from app.label_intake.policy import load_policy
    dsn = os.environ.get('TLS_DATABASE_URL', '')
    target = urlsplit(dsn)
    if target.scheme not in ('postgres', 'postgresql') or not target.hostname or not target.path.strip('/'):
        raise ValueError('Configure the named Studio database target.')
    if args.confirm_host != target.hostname or args.confirm_database != target.path.lstrip('/'):
        raise ValueError('Confirm the exact authorized database hostname and database name.')
    document = Document(policy=load_policy()) if os.environ.get('TLS_INTAKE_POLICY_JSON') else empty_document()
    import psycopg
    with psycopg.connect(dsn, connect_timeout=3, options='-c statement_timeout=10000 -c lock_timeout=3000') as connection:
        with connection.cursor() as cursor:
            cursor.execute(schema.read_text(encoding='utf-8'))
            # Repeated provisioning must preserve existing configuration and audit.
            cursor.execute('INSERT INTO app_management.management_state(singleton, document) VALUES (true, %s::jsonb) ON CONFLICT (singleton) DO NOTHING', (document.model_dump_json(),))
    print('Management schema provisioned; any existing snapshot was preserved. Activation remains explicit.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        # Do not expose a DSN, secret, private exception or connection detail.
        print('Management provisioning failed. Verify the authorized target and configuration.', file=sys.stderr)
        raise SystemExit(1) from None
