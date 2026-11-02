"""Plan-only additive print safety schema. No service stop, startup DDL or print."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from recover_direct_print import APP, require_stopped_application


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--confirm-host')
    parser.add_argument('--confirm-database')
    parser.add_argument('--confirm-container')
    args=parser.parse_args(argv)
    if not args.apply:
        print(json.dumps({'status':'PLAN ONLY','schema':'010_direct_print.sql','storage_writes':'NOT RUN'}))
        return 0
    dsn=os.environ.get('TLS_INTAKE_DATABASE_URL','')
    target=urlsplit(dsn)
    if (not args.confirm_host or target.hostname!=args.confirm_host or not args.confirm_database
            or target.path!='/'+args.confirm_database or args.confirm_container!=APP):
        parser.error('Confirm the exact intake-ledger host/database and stopped application.')
    require_stopped_application()
    import psycopg
    with psycopg.connect(dsn,connect_timeout=3,options='-c statement_timeout=30000 -c lock_timeout=3000') as connection:
        if connection.execute("SELECT to_regclass('label_intake.requests')").fetchone()[0] is None:
            raise RuntimeError('The separately authorized intake ledger schema is required.')
        tables=('direct_print_jobs','printer_safety_audit')
        existing=[connection.execute('SELECT to_regclass(%s)',('label_intake.'+name,)).fetchone()[0] is not None for name in tables]
        if any(existing):
            raise RuntimeError('Existing print safety schema must be reviewed; no implicit migration/reapply.')
        connection.execute((Path(__file__).resolve().parents[1]/'backend/schema/010_direct_print.sql').read_text())
    print(json.dumps({'status':'APPLIED','schema':'010_direct_print.sql','printer_operations':'NOT RUN'}))
    return 0


if __name__=='__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print(json.dumps({'status':'FAIL','reason':'provisioning_rejected_private_details_suppressed'}))
        raise SystemExit(1) from None
