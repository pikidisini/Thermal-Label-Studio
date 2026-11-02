"""Permanent direct-print identity. Never persist SVG, label data or wire bytes."""
import hashlib
import json
from fastapi import HTTPException
from app.intake_queue.store import destination


class PrintSafetyError(HTTPException):
    def __init__(self, code='print_safety_unavailable', status=503):
        super().__init__(status, detail={'code': code})


def fingerprint(kind, body):
    raw = json.dumps([kind, body], sort_keys=True, separators=(',', ':'),
                     ensure_ascii=False, allow_nan=False).encode()
    return hashlib.sha256(raw).hexdigest()


def runtime_store():
    from app.label_intake.runtime import create_runtime_ledger
    try:
        ledger = create_runtime_ledger()
        if ledger is None:
            raise PrintSafetyError()
        return DirectPrintStore(ledger._connect)
    except PrintSafetyError:
        raise
    except Exception:
        raise PrintSafetyError() from None


def configured_store(request):
    supplied = getattr(request.app.state, 'direct_print_store', None)
    return supplied if supplied is not None else runtime_store()


def decoded(value):
    return json.loads(value) if isinstance(value, str) else value


class DirectPrintStore:
    def __init__(self, connect):
        self.connect = connect

    def tx(self, action):
        connection = cursor = None
        try:
            connection = self.connect()
            if getattr(connection, 'autocommit', None) is not False:
                raise PrintSafetyError()
            cursor = connection.cursor()
            result = action(cursor)
            cursor.close(); cursor = None
            connection.commit()
            return result  # Never permit transport before claim commit acknowledgement.
        except PrintSafetyError:
            if connection is not None:
                try: connection.rollback()
                except Exception: pass
            raise
        except Exception:
            if connection is not None:
                try: connection.rollback()
                except Exception: pass
            raise PrintSafetyError() from None
        finally:
            if cursor is not None:
                try: cursor.close()
                except Exception: pass
            if connection is not None:
                try: connection.close()
                except Exception: pass

    def lookup(self, job_id, account, expected=None):
        def read(cursor):
            cursor.execute('SELECT account_id,fingerprint,state,items,response,kind FROM label_intake.direct_print_jobs WHERE job_id=%s', (job_id,))
            row = cursor.fetchone()
            if row is None:
                return None
            if row[0] != account:
                raise PrintSafetyError('print_job_not_found', 404)
            if expected is not None and row[1] != expected:
                raise PrintSafetyError('print_job_conflict', 409)
            items = decoded(row[3])
            return {'job_id': job_id, 'status': 'PROCESSING' if row[2] == 'PROCESSING' else
                    ('SUBMITTED' if all(i['status'] == 'SUBMITTED' for i in items) else 'STOPPED'),
                    'confirmed': False, 'items': items, 'response': decoded(row[4]) if row[4] else None,
                    'kind': row[5]}
        return self.tx(read)

    def reserve(self, job_id, account, kind, digest, target, payloads, response=None):
        items = [{'index': i, 'status': 'NOT_ATTEMPTED'} for i in range(len(payloads))]
        def insert(cursor):
            cursor.execute('SELECT identities FROM label_intake.capacity WHERE singleton=1 FOR UPDATE')
            capacity=cursor.fetchone()
            if capacity is None or capacity[0]>=1000000:
                raise PrintSafetyError('print_capacity_exhausted')
            cursor.execute('''INSERT INTO label_intake.direct_print_jobs
                (job_id,account_id,kind,fingerprint,destination,payload_hashes,items,response,state)
                VALUES(%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,'PROCESSING')
                ON CONFLICT(job_id) DO NOTHING RETURNING job_id''',
                (job_id,account,kind,digest,destination(target.host,target.port),
                 json.dumps([hashlib.sha256(p).hexdigest() for p in payloads]),json.dumps(items),json.dumps(response) if response else None))
            created=cursor.fetchone() is not None
            if created:
                cursor.execute('UPDATE label_intake.capacity SET identities=identities+1 WHERE singleton=1')
            return created
        return self.tx(insert)

    def update(self, job_id, account, items, response=None, *, terminal=False):
        def write(cursor):
            cursor.execute('''UPDATE label_intake.direct_print_jobs SET items=%s::jsonb,
                response=COALESCE(%s::jsonb,response),state=%s,updated_at=now()
                WHERE job_id=%s AND account_id=%s AND state='PROCESSING' RETURNING job_id''',
                (json.dumps(items),json.dumps(response) if response else None,
                 'TERMINAL' if terminal else 'PROCESSING',job_id,account))
            if cursor.fetchone() is None:
                # A failed conditional settlement can follow printer effects.
                # Never label it as a safe 409 admission rejection.
                raise PrintSafetyError()
        self.tx(write)

    def execute(self, job_id, account, kind, digest, target, payloads, factory, response=None):
        existing = self.lookup(job_id, account, digest)
        if existing is not None:
            return existing
        if not self.reserve(job_id, account, kind, digest, target, payloads, response):
            return self.lookup(job_id, account, digest)
        from app.intake_queue.printers import printer_operation
        from app.printing.service import PrintBeforeSendError
        items = [{'index': i, 'status': 'NOT_ATTEMPTED'} for i in range(len(payloads))]
        class Uncertain(Exception): pass
        try:
            # Hold the physical printer across the WHOLE batch, including gaps.
            with printer_operation(target, owner=job_id, store=self):
                for index, payload in enumerate(payloads):
                    items[index]['status'] = 'UNCERTAIN'
                    self.update(job_id, account, items)
                    try:
                        transport = factory(target)
                    except Exception:
                        items[index]['status'] = 'FAILED_BEFORE_SEND'
                        break
                    try:
                        transport.submit(payload)
                        items[index]['status'] = 'SUBMITTED'
                    except PrintBeforeSendError:
                        items[index]['status'] = 'FAILED_BEFORE_SEND'
                    except Exception:
                        items[index]['status'] = 'UNCERTAIN'
                    self.update(job_id, account, items)
                    if items[index]['status'] != 'SUBMITTED':
                        break
                self.update(job_id, account, items, response, terminal=True)
                if any(i['status'] == 'UNCERTAIN' for i in items):
                    raise Uncertain()
        except Uncertain:
            pass  # Keep durable printer hold; result is readable, never resent.
        except PrintBeforeSendError:
            items[0]['status'] = 'FAILED_BEFORE_SEND'
            self.update(job_id, account, items, terminal=True)
        return self.lookup(job_id, account, digest)

    def holds(self):
        def read(cursor):
            cursor.execute('SELECT owner,destination FROM label_intake.printer_owners WHERE owner IS NOT NULL')
            return [{'owner': str(owner), 'destination': address} for owner,address in cursor.fetchall()]
        return self.tx(read)

    def audit_hold(self, owner, actor, action, note):
        if not note.strip() or len(note)>1000:
            raise PrintSafetyError('invalid_note',422)
        from app.intake_queue.printers import lock_printer
        def write(cursor):
            cursor.execute('SELECT destination FROM label_intake.printer_owners WHERE owner=%s', (owner,))
            row = cursor.fetchone()
            if row is None:
                raise PrintSafetyError('hold_not_found',409)
            if not lock_printer(cursor,row[0],transaction=True):
                raise PrintSafetyError('owner_not_stopped',409)
            # Queue workers own a batch between physical TCP operations, too.
            cursor.execute("SELECT to_regclass('label_intake.queue')")
            if cursor.fetchone()[0] is not None:
                cursor.execute("SELECT state FROM label_intake.queue WHERE ledger_id=%s",(owner,))
                queued=cursor.fetchone()
                if queued is not None and queued[0]=='PROCESSING':
                    raise PrintSafetyError('owner_not_stopped',409)
            cursor.execute('SELECT state FROM label_intake.direct_print_jobs WHERE job_id=%s',(owner,))
            direct = cursor.fetchone()
            if direct is not None and direct[0] != 'TERMINAL':
                raise PrintSafetyError('owner_not_stopped',409)
            cursor.execute('SELECT state FROM label_intake.requests WHERE ledger_id=%s',(owner,))
            intake = cursor.fetchone()
            if intake is not None and intake[0] != 'TERMINAL':
                raise PrintSafetyError('owner_not_stopped',409)
            if action == 'RELEASE_HOLD':
                cursor.execute("SELECT 1 FROM label_intake.printer_safety_audit WHERE owner=%s AND action='PHYSICAL_CHECK'", (owner,))
                if cursor.fetchone() is None:
                    raise PrintSafetyError('physical_check_required',409)
                cursor.execute('UPDATE label_intake.printer_owners SET owner=NULL,held=false,updated_at=now() WHERE owner=%s', (owner,))
            cursor.execute('INSERT INTO label_intake.printer_safety_audit(owner,actor,action,note) VALUES(%s,%s,%s,%s)',(owner,actor,action,note))
        self.tx(write)


    def recover_stopped_job(self, job_id, actor, note):
        """Maintenance only, AFTER the deployment host proves the app stopped.

        Never called by HTTP, never releases printer ownership, never sends.
        """
        if not note.strip() or len(note)>1000:
            raise PrintSafetyError('invalid_note',422)
        from app.intake_queue.printers import lock_printer
        def recover(cursor):
            cursor.execute('SELECT destination FROM label_intake.direct_print_jobs WHERE job_id=%s',(job_id,))
            row=cursor.fetchone()
            if row is None: raise PrintSafetyError('print_job_not_found',404)
            if not lock_printer(cursor,row[0],transaction=True):
                raise PrintSafetyError('owner_not_stopped',409)
            cursor.execute("UPDATE label_intake.direct_print_jobs SET state='TERMINAL',updated_at=now() WHERE job_id=%s AND state='PROCESSING'",(job_id,))
            cursor.execute("INSERT INTO label_intake.printer_safety_audit(owner,actor,action,note) VALUES(%s,%s,'RECOVER_STOPPED_OWNER',%s)",(job_id,actor,note))
        self.tx(recover)
