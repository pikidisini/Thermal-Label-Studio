"""Plan-only queue lifecycle. --apply requires explicit named-target confirmation.

Run from the application root with PYTHONPATH=backend. No migration or backup is
implicit. Recover/restore require stopped owners and never submit printer bytes.
"""
import argparse
import json
import os
from urllib.parse import urlsplit
from uuid import UUID
from app.intake_queue.runtime import create_queue


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('status','pause','resume','recover','expire','restore-pause'))
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--confirm-host')
    parser.add_argument('--confirm-database')
    parser.add_argument('--owners-stopped',action='store_true')
    parser.add_argument('--job-id',type=UUID)
    parser.add_argument('--note',default='')
    args = parser.parse_args(argv)
    if not args.apply:
        print(json.dumps({'action':args.action,'status':'PLAN ONLY','database_operations':'NOT RUN','printer_operations':'NOT RUN'}))
        return 0
    parsed = urlsplit(os.environ.get('TLS_INTAKE_DATABASE_URL',''))
    if (not args.confirm_host or not args.confirm_database or parsed.hostname!=args.confirm_host
            or parsed.path.lstrip('/')!=args.confirm_database):
        parser.error('Exact database host and database confirmation are required.')
    if args.action!='status' and not args.note.strip():
        parser.error('An audit note is required.')
    if args.action in ('recover','restore-pause') and not args.owners_stopped:
        parser.error('Stop both worker containers and all printer owners before this offline action.')
    queue = create_queue()
    if queue is None:
        parser.error('Queue is not configured.')
    if args.action=='status':
        print(json.dumps(queue.operational()))
        return 0
    if args.action in ('pause','resume','restore-pause'):
        def change(cursor):
            cursor.execute('UPDATE label_intake.queue_control SET paused=%s WHERE singleton=true', (args.action!='resume',))
            cursor.execute('INSERT INTO label_intake.queue_audit(actor,action,note) VALUES(%s,%s,%s)', ('OFFLINE_ADMIN',args.action.upper(),args.note))
        queue.tx(change)
    elif args.action=='recover':
        if args.job_id is None:
            parser.error('A single explicit job ID is required.')
        job = str(args.job_id)
        queue.ledger.recover_quiesced(job)
        queue.finish(job)
        queue.tx(lambda cursor:cursor.execute('INSERT INTO label_intake.queue_audit(ledger_id,actor,action,note) VALUES(%s,%s,%s,%s)',
                                             (job,'OFFLINE_ADMIN','QUIESCED_RECOVERY',args.note)))
    else:
        if args.job_id is None:
            parser.error('A single explicit job ID is required.')
        job = str(args.job_id)
        queue.expire(job)
    print(json.dumps({'action':args.action,'status':'APPLIED','printer_operations':'NOT RUN'}))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Queue operation failed. No resend was attempted.')
        raise SystemExit(1) from None
