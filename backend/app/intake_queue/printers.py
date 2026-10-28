"""Cross-process printer ownership, shared by all actual TCP operations."""
from contextlib import contextmanager
from contextvars import ContextVar
from uuid import uuid4
from app.printing.service import PrintBeforeSendError
from .runtime import transport_queue
from .store import destination, QueueError

job_owner = ContextVar('queue_job_owner', default=None)


def acquire_printer(cursor, address, owner, inherited):
    cursor.execute('INSERT INTO label_intake.printer_owners(destination) VALUES(%s) ON CONFLICT DO NOTHING', (address,))
    cursor.execute('SELECT owner,held FROM label_intake.printer_owners WHERE destination=%s FOR UPDATE', (address,))
    current,held = cursor.fetchone()
    if held or (current is not None and str(current) != owner):
        raise QueueError('printer_busy',429)
    if inherited is not None:
        if str(current) != owner:
            raise QueueError('owner_not_stopped',409)
        return
    cursor.execute("SELECT 1 FROM label_intake.queue WHERE destination=%s AND state IN ('QUEUED','PROCESSING') LIMIT 1", (address,))
    if cursor.fetchone():
        raise QueueError('printer_busy',429)
    cursor.execute('UPDATE label_intake.printer_owners SET owner=%s,updated_at=now() WHERE destination=%s', (owner,address))



@contextmanager
def printer_operation(target, *, probe=False):
    queue = transport_queue()
    if queue is None:
        yield
        return
    address, inherited = destination(target.host,target.port), job_owner.get()
    owner = inherited or str(uuid4())
    try:
        queue.tx(lambda cursor: acquire_printer(cursor, address, owner, inherited))
    except Exception:
        raise PrintBeforeSendError('Printer ownership is unavailable; no submission attempted.') from None
    uncertain = False
    try:
        yield
    except PrintBeforeSendError:
        raise
    except BaseException:
        uncertain = not probe
        raise
    finally:
        if inherited is None:
            def release(cursor):
                cursor.execute('UPDATE label_intake.printer_owners SET owner=%s,held=%s,updated_at=now() WHERE destination=%s AND owner=%s',
                               (owner if uncertain else None,uncertain,address,owner))
            # A failed release deliberately leaves a durable owner, never a timed lease.
            queue.tx(release)
