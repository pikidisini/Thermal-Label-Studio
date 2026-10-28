"""Queue acceptance with transactional fakes; no external service/device access."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import hashlib
import json
import sqlite3
from uuid import uuid4
from threading import Barrier, Lock
from time import perf_counter
import pytest
from app.intake_queue.crypto import PayloadKeys
from app.intake_queue.store import QueueStore, QueueError, destination
from app.intake_queue.runtime import create_queue
from app.intake_queue import printers, worker
from app.label_intake.policy import Policy, authenticate
from app.label_intake.results import IntakeRequest, IntakeAdmissionError
from app.label_intake import print_service
from app.label_intake.durable_service import simulate_durable
from app.printing.service import PrintBeforeSendError
from tests.queue_fake import QueueDatabase
from tests.test_label_intake import envelope, Layouts, prepared
from tests.test_intake_policy import TOKEN, ENV, policy, source
from tests.test_intake_print import Recorder, prepare
from tests.auth_test_support import TestClient
from app.main import app


@pytest.fixture
def setup(monkeypatch):
    database = QueueDatabase()
    queue = QueueStore(database.ledger(),PayloadKeys('q1',{'q1':b'Q'*32}))
    p = policy()
    admission = authenticate(p,'Bearer '+TOKEN,{ENV:TOKEN})
    monkeypatch.setattr(app.state,'intake_queue',queue,raising=False)
    monkeypatch.delattr(app.state,'intake_policy_previous',raising=False)
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_dump_json())
    monkeypatch.setenv(ENV,TOKEN)
    return database,queue,admission


def request(identifier='REQ-001',mode='print',target='PRINTER_DEMO'):
    body = envelope(('A',))
    body.update(request_id=identifier,mode=mode,target_id=target)
    body['items'][0]['data']={'private_marker':'BUSINESS_VALUE_NOT_FOR_LOGS'}
    return IntakeRequest.model_validate(body)


def enqueue(queue,admission,value=None):
    return queue.enqueue(value or request(),admission,str(uuid4()))


def job_id(database,identifier='REQ-001'):
    return database.rows(f"SELECT ledger_id FROM queue WHERE request_id='{identifier}'")[0][0]


def test_ciphertext_authenticates_identity_and_version():
    keys = PayloadKeys('v1',{'v1':b'A'*32,'old':b'B'*32})
    version,ciphertext = keys.seal({'value':'private'},'owner')
    assert b'private' not in ciphertext
    assert keys.open(version,ciphertext,'owner') == {'value':'private'}
    for bad_version,bad_ciphertext,bad_owner in [('old',ciphertext,'owner'),(version,ciphertext,'other'),(version,ciphertext[:-1]+b'x','owner')]:
        with pytest.raises(ValueError,match='unavailable'):
            keys.open(bad_version,bad_ciphertext,bad_owner)


def test_ipv4_mapped_ipv6_uses_same_physical_printer_owner():
    assert destination('::ffff:127.0.0.1',9100)==destination('127.0.0.1',9100)
    assert destination('2001:0db8:0000::1',9100)==destination('2001:db8::1',9100)


def test_enqueue_is_atomic_encrypted_and_shares_v1_identity(setup):
    db,queue,admission = setup
    result = enqueue(queue,admission)
    assert result['status']=='QUEUED'
    assert result['status_url'].endswith('/REQ-001')
    raw = str(db.rows('SELECT * FROM queue'))+str(db.rows('SELECT * FROM requests'))
    assert 'BUSINESS_VALUE_NOT_FOR_LOGS' not in raw
    assert TOKEN not in raw
    assert enqueue(queue,admission)==result
    changed = request().model_copy(update={'items':request().items+[request().items[0].model_copy(update={'item_id':'other'})]})
    with pytest.raises(IntakeAdmissionError,match='different input'):
        enqueue(queue,admission,changed)
    prepared_request = request()
    prepared_uuid4 = uuid4()
    prepared_str = str(prepared_uuid4)
    with pytest.raises(IntakeAdmissionError, match='already being processed'):
        queue.ledger.lookup(admission.source.identity, prepared_request, prepared_str)
    assert len(db.rows('SELECT * FROM queue'))==1


@pytest.mark.parametrize('fault',['before','after'])
def test_commit_failure_never_returns_accepted_and_replay_reconciles(setup,fault):
    db,queue,admission = setup
    db.commit_fault=fault
    with pytest.raises(IntakeAdmissionError):
        enqueue(queue,admission)
    result = enqueue(queue,admission)
    assert result['status'] == 'QUEUED'
    assert len(db.rows('SELECT * FROM queue')) == 1


def test_failed_encryption_rolls_back_ledger_and_capacity(setup,monkeypatch):
    db,queue,admission = setup
    def failed(*args):
        raise ValueError('synthetic')
    monkeypatch.setattr(queue.keys,'seal',failed)
    with pytest.raises(IntakeAdmissionError):
        enqueue(queue,admission)
    assert db.rows('SELECT identities FROM capacity')==[(0,)]
    assert db.rows('SELECT * FROM requests')==[]


def test_paused_and_full_queues_refuse_without_reserving_identity(setup):
    db,queue,admission = setup
    with sqlite3.connect(db.path) as connection:
        connection.execute('UPDATE queue_control SET paused=1')
    with pytest.raises(QueueError,match='queue_paused'):
        enqueue(queue,admission)
    with sqlite3.connect(db.path) as connection:
        connection.execute('UPDATE queue_control SET paused=0,max_pending=1')
    enqueue(queue,admission)
    prepared_request_2 = request('REQ-002')
    with pytest.raises(QueueError, match='queue_full'):
        enqueue(queue, admission, prepared_request_2)
    assert db.rows('SELECT identities FROM capacity')==[(1,)]


def test_two_workers_claim_once_fifo_and_skip_busy_destinations(setup):
    db,queue,admission = setup
    target = admission.policy.targets[0].model_copy(update={'target_id':'SECOND','port':19101})
    other = admission.source.model_copy(update={'allowed_print_target_ids':('PRINTER_DEMO','SECOND')})
    admission = replace(admission,source=other,policy=admission.policy.model_copy(update={'sources':(other,),'targets':(*admission.policy.targets,target)}))
    for index in range(20):
        enqueue(queue,admission,request(f'REQ-{index:03}',target='SECOND' if index%2 else 'PRINTER_DEMO'))
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(queue.claim,['worker-1','worker-2']))
    assert len(set(claims)) == 2
    assert None not in claims
    assert set(row[0] for row in db.rows("SELECT request_id FROM queue WHERE state='PROCESSING'"))=={'REQ-000','REQ-001'}
    assert queue.claim('worker-1') is None
    assert len(db.rows("SELECT * FROM queue WHERE state='QUEUED'"))==18


def test_same_physical_address_alias_never_claimed_twice(setup):
    db,queue,admission = setup
    target = admission.policy.targets[0].model_copy(update={'target_id':'ALIAS'})
    other = admission.source.model_copy(update={'allowed_print_target_ids':('PRINTER_DEMO','ALIAS')})
    admission = replace(admission,source=other,policy=admission.policy.model_copy(update={'sources':(other,),'targets':(*admission.policy.targets,target)}))
    enqueue(queue,admission)
    enqueue(queue,admission,request('REQ-002',target='ALIAS'))
    assert queue.claim('worker-1') is not None
    assert queue.claim('worker-2') is None


def test_many_held_printers_do_not_starve_a_later_free_destination(setup):
    db,queue,admission=setup
    targets=tuple(admission.policy.targets[0].model_copy(update={'target_id':f'TARGET-{index}','port':20000+index}) for index in range(25))
    source=admission.source.model_copy(update={'allowed_print_target_ids':tuple(t.target_id for t in targets)})
    admission=replace(admission,source=source,policy=admission.policy.model_copy(update={'sources':(source,),'targets':targets}))
    for index,target in enumerate(targets):
        enqueue(queue,admission,request(f'HELD-{index:03}',target=target.target_id))
        if index<24:
            with sqlite3.connect(db.path) as connection:
                connection.execute('INSERT INTO printer_owners(destination,owner,held) VALUES(?,?,1)',(destination(target.host,target.port),str(uuid4())))
    claimed=queue.claim('worker-1')
    assert claimed==job_id(db,'HELD-024')


def test_stale_heartbeat_does_not_reassign_processing_job(setup):
    db,queue,admission = setup
    enqueue(queue,admission)
    owned = queue.claim('worker-1')
    with sqlite3.connect(db.path) as connection:
        connection.execute("INSERT INTO queue_workers VALUES('worker-1',0,NULL)")
    assert queue.claim('worker-2') is None
    assert db.rows('SELECT ledger_id FROM queue WHERE state=\'PROCESSING\'')==[(owned,)]


def test_expiry_erases_payload_but_keeps_identity(setup):
    db,queue,admission = setup
    enqueue(queue,admission)
    with sqlite3.connect(db.path) as connection:
        connection.execute('UPDATE queue SET expires_at=0')
    assert queue.claim('worker-1') is None
    assert db.rows('SELECT state,ciphertext FROM queue')==[('EXPIRED',None)]
    with pytest.raises(QueueError,match='request_expired'):
        enqueue(queue,admission)


def test_paused_queue_still_expires_payload_and_status_never_claims_stale_acceptance(setup):
    db,queue,admission=setup
    enqueue(queue,admission)
    with sqlite3.connect(db.path) as connection:
        connection.execute('UPDATE queue SET expires_at=0')
        connection.execute('UPDATE queue_control SET paused=1')
    with pytest.raises(QueueError,match='request_expired'):
        queue.status(admission.source.identity,'REQ-001')
    with pytest.raises(QueueError,match='request_expired'):
        enqueue(queue,admission)
    assert queue.claim('worker-1') is None
    assert db.rows('SELECT state,ciphertext FROM queue')==[('EXPIRED',None)]


def test_retention_erases_public_queue_metadata_but_retains_hmac_tombstone(setup):
    db,queue,admission=setup
    enqueue(queue,admission)
    owned=queue.claim('worker-1')
    with pytest.raises(QueueError,match='owner_not_stopped'):
        queue.expire(owned)
    queue.ledger.recover_quiesced(owned); queue.finish(owned)
    with sqlite3.connect(db.path) as connection:
        connection.execute('UPDATE requests SET expires_at=0')
    queue.expire(owned)
    assert db.rows('SELECT * FROM queue')==[]
    assert db.rows('SELECT state,metadata FROM requests')==[('EXPIRED',None)]
    with pytest.raises(QueueError,match='request_expired'):
        enqueue(queue,admission)


def test_queued_print_uses_existing_engine_claims_and_terminal_replay(setup,prepare):
    db,queue,admission = setup
    enqueue(queue,admission)
    owned = queue.claim('worker-1')
    body,receipt,*_ = queue.load(owned,'worker-1')
    recorder = Recorder(db)
    result = print_service.print_durable(body,admission,Layouts(),queue.ledger,receipt.original_trace_id,
        recorder.factory,lambda:admission.policy,receipt=receipt)
    queue.finish(owned)
    assert result.status == 'COMPLETED'
    assert len(recorder.calls) == 1
    assert db.rows('SELECT state,ciphertext FROM queue')==[('TERMINAL',None)]
    replay = enqueue(queue,admission)
    assert replay['replayed'] is True
    assert len(recorder.calls) == 1
    old_api = queue.ledger.lookup(admission.source.identity,body,str(uuid4()))
    assert old_api['results']==result.wire()['results']


def test_queue_simulation_never_constructs_transport(setup,prepared,monkeypatch):
    db,queue,admission = setup
    body = request(mode='simulation')
    enqueue(queue,admission,body)
    owned = queue.claim('worker-1')
    body,receipt,*_ = queue.load(owned,'worker-1')
    from app.printing.transport import TcpRawTransport
    monkeypatch.setattr(TcpRawTransport,'__init__',lambda *args:pytest.fail('simulation created printer transport'))
    result = simulate_durable(body,admission.source.identity,Layouts(),queue.ledger,receipt.original_trace_id,receipt=receipt)
    queue.finish(owned)
    assert result.status=='COMPLETED'
    assert queue.status(admission.source.identity,body.request_id)['results'][0]['simulation']['png_base64']


def test_print_uncertainty_holds_printer_until_physical_check_and_admin_action(setup,prepare):
    db,queue,admission = setup
    enqueue(queue,admission)
    owned = queue.claim('worker-1')
    body,receipt,*_ = queue.load(owned,'worker-1')
    def factory(target):
        class Transport:
            def submit(self,payload):
                raise OSError('synthetic uncertain send')
        return Transport()
    result = print_service.print_durable(body,admission,Layouts(),queue.ledger,receipt.original_trace_id,
                                       factory,lambda:admission.policy,receipt=receipt)
    queue.finish(owned)
    assert result.status=='UNCERTAIN'
    assert db.rows('SELECT held FROM printer_owners')==[(1,)]
    with pytest.raises(QueueError,match='physical_check_required'):
        queue.audit(owned,'admin','RELEASE_HOLD','Checked')
    queue.audit(owned,'operator','PHYSICAL_CHECK','Label checked at printer')
    queue.audit(owned,'admin','RELEASE_HOLD','Resolved after inspection')
    assert db.rows('SELECT owner,held FROM printer_owners')==[(None,0)]
    assert len(db.rows('SELECT * FROM queue_audit'))==2


def test_recovery_before_send_never_requeues_or_sends(setup):
    db,queue,admission = setup
    enqueue(queue,admission)
    owned = queue.claim('worker-1')
    queue.ledger.recover_quiesced(owned)
    queue.finish(owned)
    assert db.rows('SELECT state,ciphertext FROM queue')==[('TERMINAL',None)]
    assert queue.status(admission.source.identity,'REQ-001')['status']=='FAILED'
    assert queue.claim('worker-2') is None


def test_manual_transport_respects_queue_ownership_and_address_aliases(setup,monkeypatch):
    db,queue,admission = setup
    monkeypatch.setattr(printers,'transport_queue',lambda:queue)
    from app.config import PrinterTarget
    target = admission.policy.targets[0]
    physical = PrinterTarget(target.host,target.port)
    enqueue(queue,admission)
    prepared_printer_operation = printers.printer_operation(physical)
    with pytest.raises(PrintBeforeSendError):
        with prepared_printer_operation:
            pass
    owned = queue.claim('worker-1')
    token = printers.job_owner.set(owned)
    try:
        with printers.printer_operation(physical):
            pass
    finally:
        printers.job_owner.reset(token)
    assert db.rows('SELECT owner FROM printer_owners')==[(owned,)]


def test_machine_http_accepted_conflict_and_sender_isolation(setup,monkeypatch):
    db,queue,admission = setup
    client = TestClient(app)
    headers={'Authorization':'Bearer '+TOKEN}
    body = request().model_dump()
    response = client.post('/api/v2/label-intake',json=body,headers=headers)
    assert response.status_code==202,response.text
    assert response.headers['Retry-After']=='5'
    assert client.get(response.headers['Location'],headers=headers).json()['status']=='QUEUED'
    assert client.get(response.headers['Location']).status_code==401
    assert client.post('/api/v1/label-intake',json=body,headers=headers).status_code in (409,503)
    other = admission.source.model_copy(update={'identity':'OTHER','credential_env':'TLS_INTAKE_TOKEN_OTHER'})
    other_token='B'*40
    monkeypatch.setenv('TLS_INTAKE_TOKEN_OTHER',other_token)
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',admission.policy.model_copy(update={'revision':'P2','sources':(*admission.policy.sources,other)}).model_dump_json())
    assert client.get(response.headers['Location'],headers={'Authorization':'Bearer '+other_token}).status_code==404


def test_cutover_denies_sync_source_but_keeps_queue_api(setup,monkeypatch):
    _,_,admission = setup
    changed=admission.source.model_copy(update={'async_only':True})
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',admission.policy.model_copy(update={'sources':(changed,)}).model_dump_json())
    client=TestClient(app); headers={'Authorization':'Bearer '+TOKEN}
    assert client.post('/api/v1/label-intake',json=request().model_dump(),headers=headers).status_code==403
    assert client.post('/api/v2/label-intake',json=request().model_dump(),headers=headers).status_code==202


def test_runtime_default_does_not_connect_or_generate_keys():
    assert create_queue({}) is None
    with pytest.raises(ValueError):
        create_queue({'TLS_QUEUE_ENABLED':'true'})


def test_status_rechecks_mode_and_target_permission(setup):
    _,queue,admission=setup
    enqueue(queue,admission)
    for source in (admission.source.model_copy(update={'modes':()}),admission.source.model_copy(update={'allowed_print_target_ids':()})):
        denied=replace(admission,source=source)
        with pytest.raises(QueueError) as raised:
            queue.status(source.identity,'REQ-001',admission=denied)
        assert raised.value.status==403


def test_windows_cannot_claim_native_memory_acceptance(monkeypatch):
    monkeypatch.setattr(worker.sys,'platform','win32')
    with pytest.raises(RuntimeError,match='Linux'):
        worker.require_memory_fence()


@pytest.mark.parametrize('change',['revision','credential','disabled','target'])
def test_worker_rejects_changed_admission_before_storage_or_transport(setup,monkeypatch,change):
    db,queue,admission=setup
    enqueue(queue,admission); owned=queue.claim('worker-1')
    current=admission.policy
    if change=='revision': current=current.model_copy(update={'revision':'P2'})
    if change=='credential': monkeypatch.setenv(ENV,'different_token_for_testing_only_000000')
    if change=='disabled': current=current.model_copy(update={'sources':(admission.source.model_copy(update={'enabled':False}),)})
    if change=='target': current=current.model_copy(update={'targets':(current.targets[0].model_copy(update={'port':19101}),)})
    monkeypatch.setattr(worker,'create_queue',lambda:queue)
    monkeypatch.setattr(worker,'current_policy',lambda:current)
    import app.layouts.service as layouts
    monkeypatch.setattr(layouts,'LayoutService',lambda *_args:pytest.fail('changed admission read layout storage'))
    with pytest.raises((RuntimeError,IntakeAdmissionError)):
        worker.execute(owned,'worker-1')
    assert db.rows('SELECT state FROM items')==[('RECEIVED',)]


@pytest.mark.parametrize('checkpoint',['claimed','settled'])
def test_crash_after_possible_send_is_held_and_never_requeued(setup,prepare,monkeypatch,checkpoint):
    db,queue,admission=setup
    enqueue(queue,admission); owned=queue.claim('worker-1')
    body,receipt,*_=queue.load(owned,'worker-1')
    recorder=Recorder(db)
    def failed(*_args,**_kwargs):
        from app.label_intake.ledger import LedgerUnavailable
        raise LedgerUnavailable()
    monkeypatch.setattr(queue.ledger,'settle_send' if checkpoint=='claimed' else 'complete_print',failed)
    prepared_Layouts = Layouts()
    with pytest.raises(IntakeAdmissionError):
        print_service.print_durable(body, admission, prepared_Layouts, queue.ledger, receipt.original_trace_id, recorder.factory, lambda: admission.policy, receipt=receipt)
    # The fake transport has returned; this explicitly models proven quiescence.
    queue.ledger.recover_quiesced(owned); queue.finish(owned)
    assert len(recorder.calls)==1
    assert queue.status(admission.source.identity,body.request_id)['status']=='UNCERTAIN'
    assert queue.claim('worker-2') is None
    assert db.rows('SELECT held FROM printer_owners')==[(1,)]


def test_operator_inspection_admin_release_and_csrf_are_server_enforced(setup,monkeypatch):
    _,queue,_=setup
    client=TestClient(app); calls=[]
    monkeypatch.setattr(queue,'audit',lambda *args:calls.append(args))
    auth=app.state.auth_service
    with auth.transaction() as repo:
        user=repo.get('users','synthetic-admin'); user['role']='Operator'; repo.put('users',user['id'],user)
    path='/api/v1/sap-requests/'+str(uuid4())
    assert client.post(path+'/release-hold',json={'note':'Checked'}).status_code==403
    assert calls==[]
    assert client.post(path+'/physical-check',json={'note':'Inspected'}).status_code==200
    assert len(calls)==1
    assert client.post(path+'/physical-check',json={'note':'Inspected'},headers={'X-CSRF-Token':'wrong'}).status_code==403
    assert len(calls)==1
    with auth.transaction() as repo:
        user=repo.get('users','synthetic-admin'); user['role']='Admin'; repo.put('users',user['id'],user)
    assert client.post(path+'/release-hold',json={'note':'Resolved'}).status_code==200
    assert calls[-1][2]=='RELEASE_HOLD'


def test_twenty_requests_two_workers_fake_load_has_no_duplicate_delivery(setup,prepare):
    db,queue,admission=setup
    target=admission.policy.targets[0].model_copy(update={'target_id':'SECOND','port':19101})
    source=admission.source.model_copy(update={'allowed_print_target_ids':('PRINTER_DEMO','SECOND')})
    admission=replace(admission,source=source,policy=admission.policy.model_copy(update={'sources':(source,),'targets':(*admission.policy.targets,target)}))
    for index in range(20):
        enqueue(queue,admission,request(f'LOAD-{index:03}',target='SECOND' if index%2 else 'PRINTER_DEMO'))
    calls=[]; lock=Lock(); barrier=Barrier(2)
    def drain(identity):
        first=True
        while True:
            owned=queue.claim(identity)
            if owned is None: return
            body,receipt,*_=queue.load(owned,identity)
            def factory(target):
                class Transport:
                    def submit(self,payload):
                        nonlocal first
                        if first:
                            first=False; barrier.wait(timeout=10)
                        with lock: calls.append((body.request_id,target.port))
                return Transport()
            print_service.print_durable(body,admission,Layouts(),queue.ledger,receipt.original_trace_id,
                                       factory,lambda:admission.policy,receipt=receipt)
            queue.finish(owned)
    started=perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(drain,['worker-1','worker-2']))
    elapsed=perf_counter()-started
    assert len(calls)==len(set(identifier for identifier,_ in calls))==20
    assert db.rows("SELECT count(*) FROM queue WHERE state='TERMINAL'")==[(20,)]
    assert {port for _,port in calls}=={admission.policy.targets[0].port,19101}
    (db.directory/'load-report.json').write_text(json.dumps({'scope':'SQLite/recording transports only',
        'requests':20,'workers':2,'elapsed_seconds':elapsed,'requests_per_second':20/elapsed,
        'database_connections_closed':db.closed,'native_memory':'NOT RUN','PostgreSQL_concurrency':'NOT RUN'}),encoding='utf-8')
