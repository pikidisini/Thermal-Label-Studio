"""PostgreSQL ledger using a fresh injected transaction connection per operation.

No driver import, connection creation, startup initialization or print I/O. The
factory must provide a dedicated idle non-autocommit connection. Atomic admission
uses the permanent capacity row as its cross-process/rotation serialization lock.
"""
from dataclasses import dataclass
import hmac
import json
from time import time
from uuid import uuid4
import math
from .results import IntakeAdmissionError, IntakeRequest, IntakeResponse, MESSAGES, TemplateEvidence, IntakeError, error
from .ledger_models import PrintOutcome


class LedgerUnavailable(IntakeAdmissionError):
    def __init__(self):
        super().__init__(503, 'ledger_unavailable')


@dataclass(frozen=True)
class Receipt:
    ledger_id: str
    owner_token: str
    original_trace_id: str
    mode: str


def packed(value, limit=128 * 1024):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    if len(raw.encode('utf-8')) > limit:
        raise LedgerUnavailable()
    return raw


def unpacked(value):
    return json.loads(value) if isinstance(value, str) else value


class PostgresLedger:
    def __init__(self, connection_factory, keys, *, clock=time):
        self._connect, self.keys, self.clock = connection_factory, keys, clock

    def _transaction(self, action):
        connection = cursor = None
        try:
            connection = self._connect()
            if getattr(connection, 'autocommit', None) is not False:
                raise LedgerUnavailable()
            cursor = connection.cursor()
            value = action(cursor)
            cursor.close(); cursor = None
            connection.commit()
            return value  # A claim becomes eligible only AFTER commit returns.
        except Exception as exc:
            if connection is not None:
                try:
                    connection.rollback()
                except Exception:
                    pass  # Never reuse this dedicated connection.
            if isinstance(exc, IntakeAdmissionError):
                raise exc from None
            raise LedgerUnavailable() from None
        finally:
            if cursor is not None:
                try: cursor.close()
                except Exception: pass
            if connection is not None:
                try: connection.close()
                except Exception: pass

    def _find(self, cursor, sender, values):
        # Losing an old key must deny admission, not permit reuse after rotation.
        cursor.execute('SELECT key_version,key_check FROM label_intake.key_versions')
        registered = {row[0]:row[1] for row in cursor.fetchall()}
        if any(version not in self.keys.versions() or not hmac.compare_digest(check,
                self.keys.mac(version,b'intake-keycheck-v1\0',version.encode())) for version,check in registered.items()):
            raise LedgerUnavailable()
        cursor.execute('SELECT DISTINCT key_version FROM label_intake.requests')
        if any(row[0] not in registered for row in cursor.fetchall()):
            raise LedgerUnavailable()
        rows = []
        for version, (identity, digest) in values.items():
            cursor.execute('''SELECT ledger_id, owner_token, original_trace_id, mode, state,
                expires_at, payload_hmac, metadata FROM label_intake.requests
                WHERE sender = %s AND key_version = %s AND identity_hmac = %s''',
                (sender, version, identity))
            row = cursor.fetchone()
            if row is not None:
                if not hmac.compare_digest(row[6], digest):
                    raise IntakeAdmissionError(409, 'request_conflict')
                rows.append(row)
        if len(rows) > 1:
            raise LedgerUnavailable()
        return rows[0] if rows else None

    def _replay(self, cursor, row, request, trace_id):
        if row[4] == 'EXPIRED' or self.clock() >= row[5]:
            raise IntakeAdmissionError(409, 'request_expired')
        if row[4] != 'TERMINAL':
            raise IntakeAdmissionError(409, 'request_in_progress')
        if row[3] == 'simulation':
            cursor.execute('SELECT response FROM label_intake.simulation_results WHERE ledger_id = %s', (str(row[0]),))
            protected = cursor.fetchone()
            if protected is None:
                raise LedgerUnavailable()
            result = unpacked(protected[0])
        else:
            result = unpacked(row[7])
        result = {**result, 'request_id': request.request_id, 'trace_id': trace_id,
                  'original_trace_id': str(row[2]), 'replayed': True}
        if row[3] == 'simulation':
            IntakeResponse.model_validate(result)
        else:
            PrintOutcome.model_validate(result)
        if len(result['results']) != len(request.items) or any(
                any(result['results'][index][key] != getattr(item,key) for key in ('item_id','label_code','copies'))
                for index,item in enumerate(request.items)):
            raise LedgerUnavailable()
        packed(result, 12 * 1024 * 1024)
        return result

    def lookup(self, sender, request, trace_id):
        values = self.keys.values(sender, request)
        def read(cursor):
            row = self._find(cursor, sender, values)
            return self._replay(cursor, row, request, trace_id) if row else None
        return self._transaction(read)

    def admit(self, sender, request, trace_id, pins):
        request = IntakeRequest.model_validate(request.model_dump())
        pins = unpacked(packed(pins))
        values = self.keys.values(sender, request)
        # Pins contain bounded PUBLIC item metadata, never authored SVG/data.
        if len(pins) != len(request.items):
            raise LedgerUnavailable()
        for index, (pin, item) in enumerate(zip(pins, request.items)):
            expected = {'item_index': index, 'item_id': item.item_id, 'label_code': item.label_code, 'copies': item.copies}
            extra = {'target_id','policy_revision'} if request.mode == 'print' else set()
            if any(pin.get(k) != v for k, v in expected.items()) or set(pin) != set(expected) | {'template', 'media'} | extra:
                raise LedgerUnavailable()
            if request.mode == 'print':
                from app.label_data.validation import identity
                if pin['target_id'] is not None:
                    identity(pin['target_id'])
                identity(pin['policy_revision'])
            if pin['template'] is not None:
                TemplateEvidence.model_validate(pin['template'])
                media = pin['media']
                if (type(media) is not dict or set(media) != {'width_mm','height_mm','dpi'}
                        or any(type(v) not in (int,float) or not math.isfinite(v) for v in media.values())
                        or not 10 <= media['width_mm'] <= 500 or not 10 <= media['height_mm'] <= 500
                        or not 72 <= media['dpi'] <= 600):
                    raise LedgerUnavailable()
            elif pin['media'] is not None:
                raise LedgerUnavailable()
            packed(pin, 4096)
        receipt = Receipt(str(uuid4()), str(uuid4()), trace_id, request.mode)
        created = self.clock()
        retention = 86400 if request.mode == 'simulation' else 90 * 86400
        def insert(cursor):
            cursor.execute('SELECT identities FROM label_intake.capacity WHERE singleton = 1 FOR UPDATE')
            capacity = cursor.fetchone()
            if capacity is None:
                raise LedgerUnavailable()
            existing = self._find(cursor, sender, values)
            if existing:
                # Admission callers cannot become owners of an existing request.
                return self._replay(cursor, existing, request, trace_id)
            if capacity[0] >= 1_000_000:
                raise LedgerUnavailable()
            for version in self.keys.versions():
                cursor.execute('''INSERT INTO label_intake.key_versions (key_version,key_check)
                    VALUES (%s,%s) ON CONFLICT (key_version) DO NOTHING''',
                    (version,self.keys.mac(version,b'intake-keycheck-v1\0',version.encode())))
            identity, digest = values[self.keys.active]
            cursor.execute('''INSERT INTO label_intake.requests
                (ledger_id,sender,key_version,identity_hmac,payload_hmac,owner_token,original_trace_id,
                 mode,state,created_at,expires_at,metadata)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'RECEIVED',%s,%s,NULL)''',
                (receipt.ledger_id, sender, self.keys.active, identity, digest, receipt.owner_token,
                 trace_id, request.mode, created, created + retention))
            for index, pin in enumerate(pins):
                cursor.execute('''INSERT INTO label_intake.items (ledger_id,item_index,state,metadata)
                    VALUES (%s,%s,'RECEIVED',%s::jsonb)''', (receipt.ledger_id, index, packed(pin, 4096)))
            cursor.execute('UPDATE label_intake.capacity SET identities = identities + 1 WHERE singleton = 1')
            return receipt
        return self._transaction(insert)

    def _owned(self, cursor, receipt):
        cursor.execute('''SELECT owner_token, mode, state, original_trace_id FROM label_intake.requests
            WHERE ledger_id = %s FOR UPDATE''', (receipt.ledger_id,))
        row = cursor.fetchone()
        if row is None or str(row[0]) != receipt.owner_token or row[1] != receipt.mode or row[2] != 'RECEIVED':
            raise LedgerUnavailable()

    def _item(self, cursor, receipt, index):
        self._owned(cursor, receipt)
        cursor.execute('SELECT state, metadata FROM label_intake.items WHERE ledger_id = %s AND item_index = %s FOR UPDATE',
                       (receipt.ledger_id, index))
        row = cursor.fetchone()
        if row is None:
            raise LedgerUnavailable()
        return row[0], unpacked(row[1])

    def _put_item(self, cursor, receipt, index, state, metadata):
        cursor.execute('UPDATE label_intake.items SET state = %s, metadata = %s::jsonb WHERE ledger_id = %s AND item_index = %s',
                       (state, packed(metadata, 4096), receipt.ledger_id, index))

    def prepared(self, receipt, index, payload_sha256, payload_bytes):
        if len(payload_sha256) != 64 or any(c not in '0123456789abcdef' for c in payload_sha256) or not 1 <= payload_bytes <= 2 * 1024 * 1024:
            raise LedgerUnavailable()
        def update(cursor):
            state, item = self._item(cursor, receipt, index)
            if state != 'RECEIVED':
                raise LedgerUnavailable()
            self._put_item(cursor, receipt, index, 'PREPARED',
                {**item, 'payload_sha256': payload_sha256, 'payload_bytes': payload_bytes})
        self._transaction(update)

    def claim_send(self, receipt, index, *, target_id, policy_revision):
        from app.label_data.validation import identity
        identity(target_id); identity(policy_revision)
        if receipt.mode != 'print':
            raise LedgerUnavailable()
        def claim(cursor):
            state, item = self._item(cursor, receipt, index)
            if (state != 'PREPARED' or item['template'] is None
                    or (item['target_id'],item['policy_revision']) != (target_id,policy_revision)):
                raise LedgerUnavailable()
            cursor.execute('SELECT state FROM label_intake.items WHERE ledger_id = %s AND item_index < %s ORDER BY item_index',
                           (receipt.ledger_id, index))
            if any(row[0] != 'SUBMITTED' for row in cursor.fetchall()):
                raise LedgerUnavailable()
            self._put_item(cursor, receipt, index, 'SEND_CLAIMED',
                           {**item, 'target_id': target_id, 'policy_revision': policy_revision})
            return True
        return self._transaction(claim)

    def settle_send(self, receipt, index, status):
        if receipt.mode != 'print' or status not in ('SUBMITTED', 'UNCERTAIN'):
            raise LedgerUnavailable()
        def settle(cursor):
            state, item = self._item(cursor, receipt, index)
            if state != 'SEND_CLAIMED':
                raise LedgerUnavailable()
            self._put_item(cursor, receipt, index, status, item)
            if status == 'UNCERTAIN':
                cursor.execute("UPDATE label_intake.items SET state = 'SKIPPED' WHERE ledger_id = %s AND item_index > %s AND state IN ('RECEIVED','PREPARED')",
                               (receipt.ledger_id, index))
        self._transaction(settle)

    def fail_pre_send(self, receipt, index, code='processing_failed', *, skipped=False, detail=None):
        if detail is not None:
            detail = IntakeError.model_validate(detail.model_dump())
            code = detail.code
        if code not in ('processing_failed','preflight_aborted','transport_failed_before_send',
                'unknown_label_code','layout_unavailable','invalid_template','unsupported_feature',
                'invalid_media','missing_binding','null_binding','empty_binding','invalid_binding',
                'invalid_symbol','raster_failed','codec_failed','resource_limit','preparation_timeout',
                'template_not_approved','template_not_allowed','copies_not_allowed','target_not_allowed','batch_stopped'):
            raise LedgerUnavailable()
        def fail(cursor):
            state, item = self._item(cursor, receipt, index)
            if state not in ('RECEIVED','PREPARED'):
                raise LedgerUnavailable()
            self._put_item(cursor, receipt, index, 'SKIPPED' if skipped else 'FAILED',
                {**item, 'error': detail.model_dump() if detail else error(
                    'TRANSPORT' if code == 'transport_failed_before_send' else 'PREPARATION', code).model_dump()})
        self._transaction(fail)

    def settle_not_sent(self, receipt, index):
        """Only trusted proof that submit was not entered may settle a claimed item FAILED."""
        if receipt.mode != 'print':
            raise LedgerUnavailable()
        def settle(cursor):
            state, item = self._item(cursor, receipt, index)
            if state != 'SEND_CLAIMED':
                raise LedgerUnavailable()
            self._put_item(cursor, receipt, index, 'FAILED',
                {**item, 'error': error('TRANSPORT','transport_failed_before_send').model_dump()})
        self._transaction(settle)

    def complete_simulation(self, receipt, response):
        response = IntakeResponse.model_validate(response.wire())
        if receipt.mode != 'simulation' or response.original_trace_id != receipt.original_trace_id or response.replayed:
            raise LedgerUnavailable()
        result = response.wire(); result.pop('request_id')
        protected = packed(result, 12 * 1024 * 1024)
        metadata = {**result, 'results': [{k: v for k, v in item.items() if k != 'simulation'} for item in result['results']]}
        def finish(cursor):
            self._owned(cursor, receipt)
            cursor.execute('SELECT item_index FROM label_intake.items WHERE ledger_id = %s ORDER BY item_index', (receipt.ledger_id,))
            if [row[0] for row in cursor.fetchall()] != [item['item_index'] for item in result['results']]:
                raise LedgerUnavailable()
            for item in result['results']:
                state, pin = self._item(cursor, receipt, item['item_index'])
                if state not in ('RECEIVED', 'PREPARED') or (item['status'] == 'SIMULATED' and state != 'PREPARED'):
                    raise LedgerUnavailable()
                if any(item[k] != pin[k] for k in ('item_id','label_code','copies','template')):
                    raise LedgerUnavailable()
                if item['status'] == 'SIMULATED' and any(item['simulation'][k] != pin[k] for k in ('payload_sha256','payload_bytes')):
                    raise LedgerUnavailable()
                self._put_item(cursor, receipt, item['item_index'], item['status'],
                               {**pin, 'error': item['error']})
            cursor.execute('INSERT INTO label_intake.simulation_results (ledger_id,response) VALUES (%s,%s::jsonb)',
                           (receipt.ledger_id, protected))
            cursor.execute("UPDATE label_intake.requests SET state = 'TERMINAL', outcome = %s, metadata = %s::jsonb WHERE ledger_id = %s",
                           (result['status'], packed(metadata), receipt.ledger_id))
        self._transaction(finish)

    def _terminal_metadata(self, cursor, receipt, *, recovering=False):
        cursor.execute('SELECT item_index,state,metadata FROM label_intake.items WHERE ledger_id = %s ORDER BY item_index',
                       (receipt.ledger_id,))
        results = []
        for index, state, raw in cursor.fetchall():
            item = unpacked(raw)
            if recovering and state in ('RECEIVED','PREPARED','SEND_CLAIMED','SUBMITTED'):
                state = 'UNCERTAIN' if state in ('SEND_CLAIMED','SUBMITTED') else 'SKIPPED' if any(
                    r['status'] in ('SUBMITTED','UNCERTAIN') for r in results) else 'FAILED'
                self._put_item(cursor, receipt, index, state, item)
            if state not in ('SUBMITTED','UNCERTAIN','FAILED','SKIPPED'):
                raise LedgerUnavailable()
            public = {k: item[k] for k in ('item_index','item_id','label_code','copies','template')}
            public['status'] = state
            uncertain_code = 'previous_uncertain' if recovering else 'submission_uncertain'
            public['error'] = None if state == 'SUBMITTED' else item.get('error') or {
                'stage': 'RECOVERY' if recovering else 'TRANSPORT',
                'code': uncertain_code if state == 'UNCERTAIN' else 'batch_stopped' if state == 'SKIPPED' else 'processing_failed',
                'message': MESSAGES[uncertain_code if state == 'UNCERTAIN' else 'batch_stopped' if state == 'SKIPPED' else 'processing_failed']}
            if state in ('SUBMITTED','UNCERTAIN'):
                public['confirmed'] = False
                public['target_id'] = item['target_id']
            elif receipt.mode == 'print' and item.get('target_id') is not None:
                public['target_id'] = item['target_id']
            results.append(public)
        counts = {key: sum(item['status'] == status for item in results) for key, status in
                  (('simulated','SIMULATED'),('submitted','SUBMITTED'),('failed','FAILED'),('uncertain','UNCERTAIN'),('skipped','SKIPPED'))}
        counts['total'] = len(results)
        status = 'UNCERTAIN' if counts['uncertain'] else 'COMPLETED' if counts['submitted'] == len(results) else 'PARTIAL' if counts['submitted'] else 'FAILED'
        result = dict(trace_id=receipt.original_trace_id, original_trace_id=receipt.original_trace_id,
                    mode=receipt.mode, replayed=False, status=status, summary=counts, results=results)
        if receipt.mode == 'print':
            PrintOutcome.model_validate({**result,'request_id':'VALIDATION'})
        else:
            IntakeResponse.model_validate({**result,'request_id':'VALIDATION'})
        return result

    def complete_print(self, receipt):
        if receipt.mode != 'print':
            raise LedgerUnavailable()
        def finish(cursor):
            self._owned(cursor, receipt)
            metadata = self._terminal_metadata(cursor, receipt)
            cursor.execute("UPDATE label_intake.requests SET state = 'TERMINAL', outcome = %s, metadata = %s::jsonb WHERE ledger_id = %s",
                           (metadata['status'], packed(metadata), receipt.ledger_id))
            return metadata
        return self._transaction(finish)

    def recover_quiesced(self, ledger_id):
        """Explicit recovery only after ALL owners are proven stopped, never resend."""
        def recover(cursor):
            cursor.execute('''SELECT owner_token, mode, state, original_trace_id FROM label_intake.requests
                WHERE ledger_id = %s FOR UPDATE''', (ledger_id,))
            row = cursor.fetchone()
            if row is None or row[2] != 'RECEIVED':
                return
            receipt = Receipt(ledger_id, str(row[0]), str(row[3]), row[1])
            metadata = self._terminal_metadata(cursor, receipt, recovering=True)
            if receipt.mode == 'simulation':
                cursor.execute('INSERT INTO label_intake.simulation_results (ledger_id,response) VALUES (%s,%s::jsonb)',
                               (ledger_id, packed(metadata)))
            cursor.execute("UPDATE label_intake.requests SET state = 'TERMINAL', outcome = %s, metadata = %s::jsonb WHERE ledger_id = %s",
                           (metadata['status'], packed(metadata), ledger_id))
        self._transaction(recover)

    def expire(self, ledger_id):
        """Authorized retention operation; permanent HMAC tombstone remains."""
        def expire(cursor):
            cursor.execute('SELECT expires_at, state FROM label_intake.requests WHERE ledger_id = %s FOR UPDATE', (ledger_id,))
            row = cursor.fetchone()
            if row is None or self.clock() < row[0] or row[1] == 'RECEIVED':
                raise LedgerUnavailable()
            cursor.execute('DELETE FROM label_intake.simulation_results WHERE ledger_id = %s', (ledger_id,))
            cursor.execute('DELETE FROM label_intake.items WHERE ledger_id = %s', (ledger_id,))
            cursor.execute("UPDATE label_intake.requests SET state = 'EXPIRED', metadata = NULL WHERE ledger_id = %s", (ledger_id,))
        self._transaction(expire)
