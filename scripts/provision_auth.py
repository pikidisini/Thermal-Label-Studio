"""Plan-only by default; explicit schema/bootstrap/recovery on a named database."""
import argparse
from getpass import getpass
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
    parser.add_argument('--action', choices=['schema', 'bootstrap', 'recover'], default='schema')
    parser.add_argument('--username')
    parser.add_argument('--display-name')
    args = parser.parse_args()
    if not args.apply:
        print(f'PLAN ONLY: auth {args.action}. No connection or credential prompt. Requires authorized named database.')
        return 0
    dsn = os.environ.get('TLS_DATABASE_URL', '')
    target = urlsplit(dsn)
    if (target.scheme not in {'postgres', 'postgresql'} or not target.hostname or not target.path.strip('/')
            or args.confirm_host != target.hostname or args.confirm_database != target.path.lstrip('/')):
        raise ValueError('Exact authorized database host and name are required.')
    from app.auth.store import AuthStore
    from app.auth.service import AuthService, username_key
    if args.action == 'schema':
        import psycopg
        with psycopg.connect(dsn, connect_timeout=3, options='-c statement_timeout=10000 -c lock_timeout=3000') as connection:
            connection.execute((ROOT / 'backend/schema/008_auth.sql').read_text(encoding='utf-8'))
    else:
        if not args.username:
            raise ValueError('Username is required.')
        if not sys.stdin.isatty():
            raise ValueError('Bootstrap/recovery require an interactive terminal for secret input.')
        password = getpass('Temporary password (7-128 characters): ')
        if password != getpass('Confirm temporary password: '):
            raise ValueError('Password confirmation did not match.')
        auth = AuthService(AuthStore(dsn))
        if args.action == 'bootstrap':
            auth.create_user(args.username, args.display_name or args.username, 'Admin', password,
                             actor='OFFLINE_BOOTSTRAP', bootstrap=True)
        else:
            with auth.transaction() as repo:
                name = username_key(args.username)
                user = next((u for u in repo.all('users').values() if u['username_key'] == name and u['role'] == 'Admin'), None)
                if not user:
                    raise ValueError('An existing administrator is required for recovery.')
            auth.update_user(user['id'], {'password': password, 'active': True}, actor='OFFLINE_RECOVERY')
    print('Auth operation committed. Deployment and LAN acceptance remain separate.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Auth operation failed. Verify the authorized target, schema and inputs; do not blindly retry an uncertain commit.', file=sys.stderr)
        raise SystemExit(1) from None
