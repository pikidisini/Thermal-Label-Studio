"""Durable physical-printer ownership independent of queue activation."""
from contextlib import contextmanager
from contextvars import ContextVar
from uuid import uuid4
from app.printing.service import PrintBeforeSendError
from .runtime import transport_queue
from .store import destination, QueueError

job_owner = ContextVar('queue_job_owner', default=None)
transport_owner = ContextVar('transport_owner', default=None)
_active = ContextVar('physical_printer_operation', default=None)


def lock_printer(cursor, address, *, transaction=False):
    function = 'pg_try_advisory_xact_lock' if transaction else 'pg_try_advisory_lock'
    cursor.execute(f'SELECT {function}(hashtextextended(%s,734099))', (address,))
    return cursor.fetchone()[0]


def acquire_printer(cursor, address, owner, inherited):
    cursor.execute('INSERT INTO label_intake.printer_owners(destination) VALUES(%s) ON CONFLICT DO NOTHING', (address,))
    cursor.execute('SELECT owner,held FROM label_intake.printer_owners WHERE destination=%s FOR UPDATE', (address,))
    current, held = cursor.fetchone()
    if held or (current is not None and str(current) != owner):
        raise QueueError('printer_busy',429)
    if inherited is not None and str(current) != owner:
        raise QueueError('owner_not_stopped',409)
    cursor.execute("SELECT to_regclass('label_intake.queue')")
    if cursor.fetchone()[0] is not None and inherited is None:
        cursor.execute("SELECT 1 FROM label_intake.queue WHERE destination=%s AND state IN ('QUEUED','PROCESSING') LIMIT 1", (address,))
        if cursor.fetchone():
            raise QueueError('printer_busy',429)
    # Reserve conservatively before effects. A crash leaves a hold, never a lease.
    cursor.execute('UPDATE label_intake.printer_owners SET owner=%s,held=true,updated_at=now() WHERE destination=%s', (owner,address))


@contextmanager
def printer_operation(target, *, probe=False, owner=None, store=None):
    address = destination(target.host,target.port)
    active = _active.get()
    if active is not None:
        if active != address:
            raise PrintBeforeSendError('Different nested printer target rejected.')
        yield
        return
    connection = cursor = token = None
    inherited = job_owner.get()
    identity = inherited or owner or transport_owner.get() or str(uuid4())
    acquired = False
    try:
        if store is None:
            queue = transport_queue()
            if queue is not None:
                from app.printing.durable import DirectPrintStore
                store = DirectPrintStore(queue.ledger._connect)
            else:
                from app.printing.durable import runtime_store
                store = runtime_store()
        connection = store.connect()
        if getattr(connection,'autocommit',None) is not False:
            raise ValueError('Dedicated transaction connection required.')
        cursor = connection.cursor()
        if not lock_printer(cursor,address):
            raise QueueError('printer_busy',429)
        acquire_printer(cursor,address,identity,inherited)
        connection.commit()
        acquired = True
    except Exception:
        if connection is not None:
            try: connection.rollback()
            except Exception: pass
            connection.close()
        raise PrintBeforeSendError('Printer ownership is unavailable; no submission attempted.') from None
    uncertain = False
    try:
        token = _active.set(address)
        yield
    except PrintBeforeSendError:
        raise
    except BaseException:
        uncertain = not probe
        raise
    finally:
        if token is not None:
            _active.reset(token)
        try:
            if acquired:
                cursor.execute('UPDATE label_intake.printer_owners SET owner=%s,held=%s,updated_at=now() WHERE destination=%s AND owner=%s',
                    (identity if uncertain or inherited is not None else None,uncertain,address,identity))
                if cursor.rowcount != 1:
                    raise ValueError('Printer owner changed unexpectedly.')
                connection.commit()
        except Exception:
            from app.printing.durable import PrintSafetyError
            raise PrintSafetyError() from None
        finally:
            # Session advisory ownership covers the socket and final settlement.
            if connection is not None:
                connection.close()
