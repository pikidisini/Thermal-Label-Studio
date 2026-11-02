"""At-most-one submission, durable uncertainty and physical ownership with fakes."""
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest
from app.config import PrinterTarget
from app.printing.durable import PrintSafetyError, DirectPrintStore, fingerprint
from app.printing.service import PrintBeforeSendError
from app.intake_queue.printers import printer_operation
from .print_safety_fake import SafetyDatabase


@pytest.fixture
def db(): return SafetyDatabase()


TARGET=PrinterTarget('192.0.2.44',9100)


def execute(db, job=None, account='alice', digest='a'*64, factory=None):
    return db.store().execute(job or str(uuid4()),account,'label-print',digest,TARGET,
        [b'first',b'second'],factory or (lambda target: Sink([])))


class Sink:
    def __init__(self,calls): self.calls=calls
    def submit(self,payload): self.calls.append(payload)


def test_replay_after_restart_never_resends_and_conflicts_are_rejected(db):
    calls=[];job=str(uuid4());factory=lambda t:Sink(calls)
    first=execute(db,job,factory=factory)
    second=DirectPrintStore(db.connect).execute(job,'alice','label-print','a'*64,TARGET,[b'first',b'second'],factory)
    assert first==second
    assert calls==[b'first',b'second']
    with pytest.raises(PrintSafetyError) as error: execute(db,job,digest='b'*64,factory=factory)
    assert error.value.status_code==409
    with pytest.raises(PrintSafetyError) as error: execute(db,job,account='bob',factory=factory)
    assert error.value.status_code==404


def test_unknown_job_does_not_leak_other_account(db):
    assert db.store().lookup(str(uuid4()),'alice') is None


def test_uncertain_item_stops_batch_and_survives_replay(db):
    calls=[];job=str(uuid4())
    class Broken:
        def submit(self,payload): calls.append(payload);raise OSError('synthetic')
    result=execute(db,job,factory=lambda t:Broken())
    assert [i['status'] for i in result['items']]==['UNCERTAIN','NOT_ATTEMPTED']
    assert execute(db,job)['status']=='STOPPED'
    assert calls==[b'first']
    assert db.store().holds()[0]['owner']==job
    with pytest.raises(PrintBeforeSendError):
        with printer_operation(TARGET,store=db.store()): pytest.fail('Held printer acquired')


def test_before_send_failure_does_not_hold_printer(db):
    class Broken:
        def submit(self,payload): raise PrintBeforeSendError()
    result=execute(db,factory=lambda t:Broken())
    assert result['items'][0]['status']=='FAILED_BEFORE_SEND'
    assert db.store().holds()==[]


@pytest.mark.parametrize('fault',['before','after'])
def test_reservation_commit_failure_never_submits(db,fault):
    calls=[];db.commit_fault=fault
    # lookup also owns a transaction; inject at INSERT rather than read.
    original=db.store();reserve=original.reserve
    def broken(*args): db.commit_fault=fault;return reserve(*args)
    original.reserve=broken;db.commit_fault=None
    with pytest.raises(PrintSafetyError):
        original.execute(str(uuid4()),'alice','label-print','a'*64,TARGET,[b'x'],lambda t:Sink(calls))
    assert calls==[]


def test_lost_claim_ack_keeps_uncertainty_without_transport(db):
    store=db.store();original=store.update;calls=[];job=str(uuid4())
    def update(*args,**kwargs): db.commit_fault='after';return original(*args,**kwargs)
    store.update=update
    with pytest.raises(PrintSafetyError):
        store.execute(job,'alice','label-print','a'*64,TARGET,[b'x'],lambda t:Sink(calls))
    assert calls==[]
    assert db.store().lookup(job,'alice')['items'][0]['status']=='UNCERTAIN'
    assert db.store().holds()[0]['owner']==job


def test_concurrent_replay_reads_processing_without_sending(db):
    entered=Event();finish=Event();calls=[];job=str(uuid4())
    class Blocking:
        def submit(self,payload): calls.append(payload);entered.set();assert finish.wait(5)
    with ThreadPoolExecutor(2) as pool:
        future=pool.submit(execute,db,job,'alice','a'*64,lambda t:Blocking())
        assert entered.wait(5)
        try:
            replay=execute(db,job)
            assert replay['status']=='PROCESSING'
        finally: finish.set()
        assert future.result()['status']=='SUBMITTED'
    assert calls==[b'first',b'second']


def test_physical_lock_covers_routes_and_different_printers_can_progress(db):
    with printer_operation(TARGET,store=db.store()):
        # A separate context/process has no inherited ownership.
        from contextvars import Context
        def contender():
            with pytest.raises(PrintBeforeSendError):
                with printer_operation(TARGET,store=db.store()): pytest.fail('busy acquired')
        Context().run(contender)
        def other():
            with printer_operation(PrinterTarget('192.0.2.45',9100),store=db.store()): pass
        Context().run(other)


def test_physical_check_and_admin_release_never_resend(db):
    job=str(uuid4());calls=[]
    class Broken:
        def submit(self,p):calls.append(p);raise OSError()
    execute(db,job,factory=lambda t:Broken())
    with pytest.raises(PrintSafetyError) as error:
        db.store().audit_hold(job,'admin','RELEASE_HOLD','Checked device')
    assert error.value.status_code==409
    db.store().audit_hold(job,'operator','PHYSICAL_CHECK','Checked the physical printer')
    db.store().audit_hold(job,'admin','RELEASE_HOLD','Allow a new deliberate job')
    assert db.store().holds()==[]
    execute(db,job)
    assert calls==[b'first']


def test_live_owner_cannot_be_released_after_old_physical_check(db):
    job=str(uuid4())
    with printer_operation(TARGET,owner=job,store=db.store()):
        with pytest.raises(PrintSafetyError) as error:
            db.store().audit_hold(job,'operator','PHYSICAL_CHECK','Checked')
        assert error.value.status_code==409


def test_fingerprint_preserves_order_copies_target_and_exact_values():
    base={'artifacts':['a','b'],'copies':1,'host':'192.0.2.44','port':9100}
    assert fingerprint('label-print',base)==fingerprint('label-print',dict(reversed(list(base.items()))))
    for changed in [{'artifacts':['b','a']},{'copies':2},{'host':'192.0.2.45'},{'port':9101}]:
        assert fingerprint('label-print',{**base,**changed})!=fingerprint('label-print',base)



def test_crashed_job_requires_stopped_owner_recovery_before_release(db):
    job=str(uuid4());store=db.store()
    assert store.reserve(job,'alice','studio','a'*64,TARGET,[b'x'])
    store.update(job,'alice',[{'index':0,'status':'UNCERTAIN'}])
    def reserve_owner(cursor):
        cursor.execute('INSERT INTO label_intake.printer_owners(destination,owner,held) VALUES(%s,%s,true)',('[192.0.2.44]:9100',job))
    store.tx(reserve_owner)
    with pytest.raises(PrintSafetyError) as error:
        store.audit_hold(job,'operator','PHYSICAL_CHECK','Device checked')
    assert error.value.detail['code']=='owner_not_stopped'
    # Privileged maintenance after proof that app owners are stopped.
    store.recover_stopped_job(job,'maintenance','Stopped application verified')
    assert store.lookup(job,'alice')['status']=='STOPPED'
    store.audit_hold(job,'operator','PHYSICAL_CHECK','Device checked after recovery')
    store.audit_hold(job,'admin','RELEASE_HOLD','New deliberate work allowed')
    calls=[];execute(db,job,account='alice',factory=lambda t:Sink(calls))
    assert calls==[]


def test_default_runtime_without_ledger_fails_closed(monkeypatch):
    from app.printing.durable import runtime_store
    monkeypatch.delenv('TLS_INTAKE_LEDGER_JSON',raising=False)
    with pytest.raises(PrintSafetyError): runtime_store()



def test_direct_identity_capacity_is_bounded_and_replay_uses_no_new_slot(db):
    calls=[];job=str(uuid4())
    execute(db,job,factory=lambda t:Sink(calls))
    execute(db,job,factory=lambda t:Sink(calls))
    assert db.rows('SELECT identities FROM capacity')==[(1,)]
    db.store().tx(lambda c:c.execute('UPDATE label_intake.capacity SET identities=1000000'))
    with pytest.raises(PrintSafetyError): execute(db,factory=lambda t:Sink(calls))
    assert calls==[b'first',b'second']



def test_prepared_studio_response_survives_crash_after_last_settlement(db):
    store=db.store();job=str(uuid4());response={'request_id':'synthetic','confirmed':False}
    assert store.reserve(job,'alice','studio','a'*64,TARGET,[b'x'],response)
    store.update(job,'alice',[{'index':0,'status':'SUBMITTED'}])
    store.recover_stopped_job(job,'maintenance','Application stopped and ownership checked')
    result=store.lookup(job,'alice')
    assert result['status']=='SUBMITTED'
    assert result['response']==response
