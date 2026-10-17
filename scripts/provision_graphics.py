"""Plan-only Graphics provisioning; --apply requires exact authorized target confirmation."""
import argparse
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--confirm-host')
    parser.add_argument('--confirm-database')
    args = parser.parse_args()
    if not args.apply:
        print('PLAN ONLY: apply 005_graphics.sql to the authorized Studio PostgreSQL target. No connection made.')
        return 0
    target = urlsplit(os.environ.get('TLS_DATABASE_URL', ''))
    if (target.scheme not in ('postgres', 'postgresql') or not target.hostname
            or not target.path.strip('/') or args.confirm_host != target.hostname
            or args.confirm_database != target.path.lstrip('/')):
        raise ValueError('Confirm the authorized database hostname and database name.')
    import psycopg
    with psycopg.connect(os.environ['TLS_DATABASE_URL'], connect_timeout=3,
                         options='-c statement_timeout=10000 -c lock_timeout=3000') as connection:
        with connection.cursor() as cursor:
            cursor.execute((ROOT / 'backend/schema/005_graphics.sql').read_text(encoding='utf-8'))
    print('Graphics schema provisioned. Existing records preserved.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Graphics provisioning failed. Verify the authorized target and configuration.', file=sys.stderr)
        raise SystemExit(1) from None
