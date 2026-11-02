"""Plan-only direct-print recovery after the named application is proven stopped.

Never stops a container, releases a printer hold, applies DDL or resends a job.
Run on the deployment host with the authorized intake ledger environment.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

APP = 'thermal-label-studio-lan-app-1'


def require_stopped_application():
    result = subprocess.run(['docker','inspect',APP,'--format','{{.State.Running}}'],
                            capture_output=True,timeout=10)
    running = subprocess.run(['docker','ps','--filter','label=com.docker.compose.project=thermal-label-studio-lan',
                              '--filter','label=com.docker.compose.service=app','-q'],capture_output=True,timeout=10)
    if result.returncode or result.stdout.strip()!=b'false' or running.returncode or running.stdout.strip():
        raise RuntimeError('Application owners are not proven stopped; recovery rejected.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--job-id', type=UUID)
    parser.add_argument('--confirm-host')
    parser.add_argument('--confirm-database')
    parser.add_argument('--confirm-container')
    parser.add_argument('--actor')
    parser.add_argument('--note')
    args = parser.parse_args(argv)
    if not args.apply:
        print(json.dumps({'status':'PLAN ONLY','database_writes':'NOT RUN','printer_operations':'NOT RUN'}))
        return 0
    database = urlsplit(os.environ.get('TLS_INTAKE_DATABASE_URL',''))
    if (not args.job_id or args.job_id.version != 4 or args.confirm_container != APP
            or not args.confirm_host or args.confirm_host != database.hostname
            or not args.confirm_database or '/' + args.confirm_database != database.path
            or not args.actor or len(args.actor)>128 or not args.note):
        parser.error('Confirm the exact ledger host/database, stopped application, job, actor and physical recovery note.')
    # No force/timeout override: a running or unidentified owner blocks recovery.
    require_stopped_application()
    from app.printing.durable import runtime_store
    runtime_store().recover_stopped_job(str(args.job_id),args.actor,args.note)
    print(json.dumps({'status':'RECOVERED','job_id':str(args.job_id),'printer_hold':'PRESERVED','resent':False}))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print(json.dumps({'status':'FAIL','reason':'recovery_rejected_private_details_suppressed'}))
        raise SystemExit(1) from None
