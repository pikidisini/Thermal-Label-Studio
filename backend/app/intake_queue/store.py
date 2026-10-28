"""PostgreSQL queue transactions share the existing permanent identity ledger."""
from datetime import datetime, timezone
import ipaddress
from uuid import UUID
from app.label_intake.ledger import Receipt, LedgerUnavailable, unpacked
from app.label_intake.results import IntakeAdmissionError, IntakeRequest


class QueueError(IntakeAdmissionError):
    def __init__(self, code='queue_unavailable', status=503):
        self.code, self.status = code, status
        ValueError.__init__(self,code)


def destination(host, port):
    address=ipaddress.ip_address(host)
    address=getattr(address,'ipv4_mapped',None) or address
    return f'[{address.compressed}]:{int(port)}'


class QueueStore:
    def __init__(self, ledger, keys):
        self.ledger, self.keys = ledger, keys

    def tx(self, action):
        try:
            return self.ledger._transaction(action)
        except IntakeAdmissionError as exc:
            if isinstance(exc.__cause__, QueueError):
                raise exc.__cause__ from None
            raise

    def enqueue(self, request, admission, trace):
        target = next(t for t in admission.policy.targets if t.target_id == request.target_id)
        address = destination(target.host, target.port)
        pins = [dict(item_index=i, item_id=item.item_id, label_code=item.label_code,
                     copies=item.copies, template=None, media=None,
                     **({'target_id': request.target_id, 'policy_revision': admission.policy.revision}
                        if request.mode == 'print' else {})) for i, item in enumerate(request.items)]

        try:
            return self.ledger.admit(admission.source.identity, request, trace, pins,
                                     on_insert=lambda cursor, receipt: self._enqueue(cursor, receipt, request, admission, trace, address),
                                     on_existing=lambda cursor, row: self._existing(cursor, row, request, trace))
        except LedgerUnavailable as exc:
            if isinstance(exc.__cause__, QueueError):
                raise exc.__cause__ from None
            raise

    def _existing(self, cursor, row, request, trace):
        if row[4] == 'EXPIRED' or self.ledger.clock() >= row[5]:
            raise QueueError('request_expired',410)
        cursor.execute('SELECT state,expires_at<=now() FROM label_intake.queue WHERE ledger_id = %s', (str(row[0]),))
        queued = cursor.fetchone()
        if queued:
            if queued[0] == 'EXPIRED' or (queued[0]=='QUEUED' and queued[1]):
                raise QueueError('request_expired',410)
            if queued[0] == 'TERMINAL':
                return self.ledger._replay(cursor,row,request,trace)
            return self.acceptance(request.request_id, str(row[2]), queued[0])
        # A synchronous identity is never re-enqueued, including in-progress claims.
        return self.ledger._replay(cursor, row, request, trace)


    def _enqueue(self, cursor, receipt, request, admission, trace, address):
        cursor.execute('SELECT paused,max_pending FROM label_intake.queue_control WHERE singleton = true FOR UPDATE')
        control = cursor.fetchone()
        if control is None or control[0]:
            raise QueueError('queue_paused')
        cursor.execute("SELECT count(*) FROM label_intake.queue WHERE state IN ('QUEUED','PROCESSING')")
        if cursor.fetchone()[0] >= control[1]:
            raise QueueError('queue_full', 429)
        version, ciphertext = self.keys.seal(request.model_dump(), receipt.ledger_id)
        cursor.execute('''INSERT INTO label_intake.queue
            (ledger_id,request_id,sender,target_id,destination,mode,state,ciphertext,key_version,
             credential_digest,policy_revision) VALUES (%s,%s,%s,%s,%s,%s,'QUEUED',%s,%s,%s,%s)''',
            (receipt.ledger_id,request.request_id,admission.source.identity,request.target_id,address,
             request.mode,ciphertext,version,admission.credential_sha256,admission.policy.revision))
        return self.acceptance(request.request_id, trace, 'QUEUED')

    @staticmethod
    def acceptance(request_id, trace, state):
        from urllib.parse import quote
        return {'request_id': request_id, 'trace_id': trace, 'status': state, 'status_url': '/api/v2/label-intake/' + quote(request_id, safe='')}

    def status(self, sender, request_id, *, admission=None):
        def read(cursor):
            cursor.execute('''SELECT q.state,r.original_trace_id,r.metadata,r.ledger_id,r.mode,r.expires_at,q.target_id,q.expires_at<=now()
                FROM label_intake.queue q JOIN label_intake.requests r USING(ledger_id)
                WHERE q.sender=%s AND q.request_id=%s''', (sender,request_id))
            row = cursor.fetchone()
            if not row:
                raise QueueError('request_not_found',404)
            self._authorize_status(admission, sender, row)
            if row[0] == 'EXPIRED' or self.ledger.clock()>=row[5] or (row[0]=='QUEUED' and row[7]):
                raise QueueError('request_expired',410)
            if row[0] == 'TERMINAL':
                return self._terminal_status(cursor, row, request_id)
            return self.acceptance(request_id,str(row[1]),row[0])
        return self.tx(read)

    @staticmethod
    def _authorize_status(admission, sender, row):
        if admission is not None:
            from app.label_intake.policy import select_print_target, PolicyDenied
            if admission.source.identity!=sender or row[4] not in admission.source.modes:
                raise QueueError('sender_not_allowed',403)
            try:
                select_print_target(admission,row[6])
            except PolicyDenied:
                raise QueueError('target_not_allowed',403) from None

    @staticmethod
    def _terminal_status(cursor, row, request_id):
        if row[4] == 'simulation':
            cursor.execute('SELECT response FROM label_intake.simulation_results WHERE ledger_id=%s', (str(row[3]),))
            result = cursor.fetchone()
            metadata = unpacked(result[0]) if result else None
        else:
            metadata = unpacked(row[2]) if row[2] else None
        if metadata is None:
            raise QueueError()
        return {**metadata, 'request_id':request_id}

    def claim(self, worker_id):
        def pick(cursor):
            cursor.execute('SELECT paused FROM label_intake.queue_control WHERE singleton=true')
            row = cursor.fetchone()
            # Expiry never restarts a job. Permanent ledger identity is retained.
            cursor.execute("""UPDATE label_intake.queue SET state='EXPIRED',ciphertext=NULL,finished_at=now()
                WHERE state='QUEUED' AND expires_at <= now() RETURNING ledger_id""")
            expired = [str(row[0]) for row in cursor.fetchall()]
            for ledger_id in expired:
                cursor.execute("UPDATE label_intake.requests SET state='EXPIRED',metadata=NULL WHERE ledger_id=%s AND state='RECEIVED'",(ledger_id,))
            if not row or row[0]:
                return None
            cursor.execute('''SELECT q.ledger_id,q.destination FROM label_intake.queue q
                WHERE q.state='QUEUED' AND q.expires_at>now()
                AND NOT EXISTS(SELECT 1 FROM label_intake.queue earlier
                    WHERE earlier.destination=q.destination AND earlier.sequence<q.sequence
                    AND earlier.state IN ('QUEUED','PROCESSING'))
                AND NOT EXISTS(SELECT 1 FROM label_intake.printer_owners busy
                    WHERE busy.destination=q.destination AND (busy.owner IS NOT NULL OR busy.held=true))
                ORDER BY q.sequence LIMIT 20 FOR UPDATE OF q SKIP LOCKED''')
            for ledger_id, address in cursor.fetchall():
                cursor.execute('INSERT INTO label_intake.printer_owners(destination) VALUES(%s) ON CONFLICT DO NOTHING', (address,))
                cursor.execute('''UPDATE label_intake.printer_owners SET owner=%s,updated_at=now()
                    WHERE destination=%s AND owner IS NULL AND held=false RETURNING owner''', (str(ledger_id),address))
                if cursor.fetchone() is None:
                    continue
                cursor.execute("UPDATE label_intake.queue SET state='PROCESSING',worker_id=%s,started_at=now() WHERE ledger_id=%s",
                               (worker_id,str(ledger_id)))
                return str(ledger_id)
            return None
        return self.tx(pick)

    def load(self, ledger_id, worker_id):
        def read(cursor):
            cursor.execute('''SELECT q.ciphertext,q.key_version,q.credential_digest,q.policy_revision,
                r.owner_token,r.original_trace_id,r.mode,q.destination,q.sender
                FROM label_intake.queue q JOIN label_intake.requests r USING(ledger_id)
                WHERE q.ledger_id=%s AND q.state='PROCESSING' AND q.worker_id=%s''', (ledger_id,worker_id))
            row = cursor.fetchone()
            if not row:
                raise QueueError()
            return row
        row = self.tx(read)
        request = IntakeRequest.model_validate(self.keys.open(row[1],row[0],ledger_id))
        return request, Receipt(ledger_id,str(row[4]),str(row[5]),row[6]), bytes(row[2]), row[3], row[7], row[8]

    def finish(self, ledger_id):
        def finish(cursor):
            cursor.execute('SELECT state,outcome FROM label_intake.requests WHERE ledger_id=%s FOR UPDATE', (ledger_id,))
            row = cursor.fetchone()
            if not row or row[0] != 'TERMINAL':
                raise QueueError()
            cursor.execute("UPDATE label_intake.queue SET state='TERMINAL',ciphertext=NULL,finished_at=now() WHERE ledger_id=%s AND state='PROCESSING'",
                           (ledger_id,))
            if row[1] == 'UNCERTAIN':
                cursor.execute('UPDATE label_intake.printer_owners SET held=true,updated_at=now() WHERE owner=%s', (ledger_id,))
            else:
                cursor.execute('UPDATE label_intake.printer_owners SET owner=NULL,updated_at=now() WHERE owner=%s AND held=false', (ledger_id,))
        self.tx(finish)

    def heartbeat(self, worker_id, current=None):
        self.tx(lambda cursor: cursor.execute('''INSERT INTO label_intake.queue_workers(worker_id,heartbeat,current_job)
            VALUES(%s,now(),%s) ON CONFLICT(worker_id) DO UPDATE SET heartbeat=now(),current_job=EXCLUDED.current_job''',
            (worker_id,current)))

    def expire(self, ledger_id):
        def read(cursor):
            cursor.execute('SELECT state FROM label_intake.queue WHERE ledger_id=%s',(ledger_id,))
            row=cursor.fetchone()
            if row and row[0] not in ('TERMINAL','EXPIRED'):
                raise QueueError('owner_not_stopped',409)
        self.tx(read)
        # Explicit privileged maintenance, not the ordinary runtime role. Queue
        # states cannot return from TERMINAL/EXPIRED to PROCESSING.
        self.ledger.expire(ledger_id)
        self.tx(lambda cursor:cursor.execute("DELETE FROM label_intake.queue WHERE ledger_id=%s AND state IN ('TERMINAL','EXPIRED')",(ledger_id,)))

    def view(self, limit=100):
        def read(cursor):
            cursor.execute('''SELECT q.ledger_id,q.request_id,q.sender,q.target_id,q.state,q.created_at,
                q.started_at,q.finished_at,r.outcome,r.metadata,p.held FROM label_intake.queue q
                JOIN label_intake.requests r USING(ledger_id)
                LEFT JOIN label_intake.printer_owners p ON p.owner=q.ledger_id
                ORDER BY q.sequence DESC LIMIT %s''', (limit,))
            names = ('job_id','request_id','sender','target_id','state','created_at','started_at','finished_at','outcome','result','held')
            return [dict(zip(names,[v.isoformat() if isinstance(v,datetime) else str(v) if isinstance(v,UUID) else v for v in row])) for row in cursor.fetchall()]
        return self.tx(read)

    def audit(self, ledger_id, actor, action, note):
        # A physical check is meaningful only after a held operation has ended.
        return self.audit_hold(ledger_id,actor,action,note)

    def holds(self):
        def read(cursor):
            cursor.execute('SELECT owner,destination,updated_at FROM label_intake.printer_owners WHERE held=true ORDER BY updated_at')
            return [{'owner': str(owner), 'destination': address, 'since': at.isoformat()} for owner,address,at in cursor.fetchall()]
        return self.tx(read)

    def audit_hold(self, owner, actor, action, note):
        if not note.strip() or len(note)>1000:
            raise QueueError('invalid_note',422)
        def write(cursor):
            cursor.execute('SELECT owner FROM label_intake.printer_owners WHERE owner=%s AND held=true FOR UPDATE', (owner,))
            if cursor.fetchone() is None:
                raise QueueError('hold_not_found',409)
            cursor.execute('SELECT state FROM label_intake.queue WHERE ledger_id=%s', (owner,))
            queued = cursor.fetchone()
            if queued is not None and queued[0] != 'TERMINAL':
                raise QueueError('owner_not_stopped',409)
            if action == 'RELEASE_HOLD':
                cursor.execute("SELECT 1 FROM label_intake.queue_audit WHERE printer_owner=%s AND action='PHYSICAL_CHECK'", (owner,))
                if cursor.fetchone() is None:
                    raise QueueError('physical_check_required',409)
                cursor.execute('UPDATE label_intake.printer_owners SET owner=NULL,held=false,updated_at=now() WHERE owner=%s', (owner,))
            cursor.execute('INSERT INTO label_intake.queue_audit(printer_owner,actor,action,note) VALUES(%s,%s,%s,%s)', (owner,actor,action,note))
        self.tx(write)

    def history(self, ledger_id):
        def read(cursor):
            cursor.execute('''SELECT actor,action,note,at FROM label_intake.queue_audit
                WHERE ledger_id=%s OR printer_owner=%s ORDER BY sequence''', (ledger_id,ledger_id))
            return [{'actor': actor, 'action': action, 'note': note, 'at': at.isoformat()} for actor,action,note,at in cursor.fetchall()]
        return self.tx(read)

    def operational(self):
        def read(cursor):
            cursor.execute('SELECT paused,max_pending FROM label_intake.queue_control WHERE singleton=true')
            control = cursor.fetchone()
            if not control:
                raise QueueError()
            cursor.execute('SELECT worker_id,heartbeat,current_job FROM label_intake.queue_workers ORDER BY worker_id')
            now = datetime.now(timezone.utc)
            workers = [{'worker_id': w, 'heartbeat': h.isoformat(), 'healthy': (now - h).total_seconds() < 20, 'current_job': str(j) if j else None}
                       for w,h,j in cursor.fetchall()]
            cursor.execute("SELECT count(*),EXTRACT(epoch FROM now()-min(created_at)) FROM label_intake.queue WHERE state='QUEUED'")
            depth,age = cursor.fetchone()
            cursor.execute('SELECT count(*) FROM label_intake.printer_owners WHERE held=true')
            held = cursor.fetchone()[0]
            cursor.execute("""SELECT count(*) FROM label_intake.queue q LEFT JOIN label_intake.queue_workers w
                ON w.worker_id=q.worker_id WHERE q.state='PROCESSING' AND
                (w.worker_id IS NULL OR w.heartbeat<now()-interval '20 seconds' OR w.current_job IS DISTINCT FROM q.ledger_id)""")
            stalled = cursor.fetchone()[0]
            return {'paused': control[0], 'max_pending': control[1], 'queued': depth, 'oldest_seconds': float(age or 0), 'held_printers': held, 'stalled_jobs': stalled, 'workers': workers, 'expected_workers': 2}
        return self.tx(read)
