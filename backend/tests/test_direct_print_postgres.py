"""Opt-in disposable PostgreSQL proof. Never uses an application DSN or volume."""
import multiprocessing
import os
from urllib.parse import urlsplit
from pathlib import Path
from uuid import uuid4
import pytest
from app.config import PrinterTarget
from app.printing.durable import DirectPrintStore, PrintSafetyError
from app.intake_queue.printers import printer_operation

DSN = os.environ.get('TLS_TEST_PRINT_SAFETY_DSN', '')
pytestmark = pytest.mark.skipif(not DSN, reason='Explicit disposable PostgreSQL target not supplied')


def connect(dsn):
    import psycopg
    return psycopg.connect(dsn, connect_timeout=3, options='-c statement_timeout=5000 -c lock_timeout=3000')


@pytest.fixture(scope='module')
def provisioned():
    if (os.environ.get('TLS_TEST_PRINT_SAFETY_APPLY') != 'true'
            or not urlsplit(DSN).path.startswith('/tls_p1_print_safety')):
        pytest.fail('Authorize a new disposable tls_p1_print_safety database explicitly')
    with connect(DSN) as connection:
        if connection.execute("SELECT to_regnamespace('label_intake')").fetchone()[0] is not None:
            pytest.fail('Disposable target must be fresh; existing schema will not be reused')
        root=Path(__file__).resolve().parents[1]/'schema'
        connection.execute((root/'002_label_intake.sql').read_text())
        connection.execute((root/'010_direct_print.sql').read_text())
    return DSN


def child_owner(dsn, job, port, pipe):
    store=DirectPrintStore(lambda:connect(dsn))
    target=PrinterTarget('192.0.2.44',port)
    store.reserve(job,'alice','studio','a'*64,target,[b'synthetic'])
    with printer_operation(target,owner=job,store=store):
        store.update(job,'alice',[{'index':0,'status':'UNCERTAIN'}])
        pipe.send('OWNED')
        if pipe.recv()=='CRASH':
            os._exit(0)  # Intentionally skip finally: model a real process loss.


def test_cross_process_crash_ownership_and_replay(provisioned):
    store=DirectPrintStore(lambda:connect(provisioned))
    context=multiprocessing.get_context('spawn')
    parent,child=context.Pipe();job=str(uuid4());port=21001
    process=context.Process(target=child_owner,args=(provisioned,job,port,child))
    process.start()
    try:
        assert parent.poll(15) and parent.recv()=='OWNED'
        target=PrinterTarget('192.0.2.44',port)
        calls=[]
        class Sink:
            def submit(self,payload): calls.append(payload)
        assert store.execute(job,'alice','studio','a'*64,target,[b'synthetic'],lambda t:Sink())['status']=='PROCESSING'
        with pytest.raises(PrintSafetyError):
            store.audit_hold(job,'operator','PHYSICAL_CHECK','Live owner must remain blocked')
        # A distinct process cannot acquire the occupied physical printer.
        other=store.execute(str(uuid4()),'bob','studio','b'*64,target,[b'other'],lambda t:Sink())
        assert other['items'][0]['status']=='FAILED_BEFORE_SEND'
        with printer_operation(PrinterTarget('192.0.2.45',port),store=store): pass
        parent.send('CRASH');process.join(15)
        assert process.exitcode==0
        assert store.lookup(job,'alice')['items'][0]['status']=='UNCERTAIN'
        with pytest.raises(PrintSafetyError):
            store.audit_hold(job,'operator','PHYSICAL_CHECK','Crash needs maintenance recovery')
        store.recover_stopped_job(job,'maintenance','Child process exit verified')
        store.audit_hold(job,'operator','PHYSICAL_CHECK','Device inspected after process exit')
        store.audit_hold(job,'admin','RELEASE_HOLD','Allow new deliberate work')
        assert store.execute(job,'alice','studio','a'*64,target,[b'synthetic'],lambda t:Sink())['status']=='STOPPED'
        assert calls==[]
    finally:
        if process.is_alive():
            process.terminate();process.join(10)
        parent.close();child.close()


def test_real_postgres_permanent_identity_and_terminal_outcome(provisioned):
    store=DirectPrintStore(lambda:connect(provisioned));job=str(uuid4());calls=[]
    class Sink:
        def submit(self,payload):calls.append(payload)
    target=PrinterTarget('192.0.2.46',21002)
    first=store.execute(job,'alice','label-print','c'*64,target,[b'synthetic'],lambda t:Sink())
    assert DirectPrintStore(lambda:connect(provisioned)).execute(job,'alice','label-print','c'*64,target,[b'synthetic'],lambda t:Sink())==first
    assert calls==[b'synthetic']
    with pytest.raises(PrintSafetyError):
        store.update(job,'alice',[{'index':0,'status':'UNCERTAIN'}],terminal=True)
    import psycopg
    with pytest.raises(psycopg.Error):
        with connect(provisioned) as connection:
            connection.execute('DELETE FROM label_intake.direct_print_jobs WHERE job_id=%s',(job,))
    assert store.lookup(job,'alice')['status']=='SUBMITTED'
