"""Transactional fake evidence for identity/replay/claim/retention/crash windows."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from threading import Barrier
from uuid import uuid4
import pytest
from .auth_test_support import TestClient
from app.main import app
from app.label_intake import http, service
from app.label_intake.identity import LedgerKeys, canonical_json
from app.label_intake.ledger import LedgerUnavailable, Receipt
from app.label_intake.results import IntakeAdmissionError, IntakeRequest
from tests.intake_ledger_fake import LedgerDatabase
from tests.test_label_intake import envelope, stored, Layouts, prepared, admitted, ROOT


def request(mode='print', copies=1):
    body = envelope(copies=copies); body['mode'] = mode
    body['items'][0]['data'] = {'Z':0, 'FLAG':False, 'SECRET':'synthetic-business-value'}
    return IntakeRequest.model_validate(body)


def pins(body):
    result = []
    for index, item in enumerate(body.items):
        pin = dict(item_index=index,item_id=item.item_id,label_code=item.label_code,copies=item.copies,
            template=dict(version=1,svg_sha256='a'*64),media=dict(width_mm=40,height_mm=30,dpi=203))
        if body.mode == 'print':
            pin.update(target_id='PRINTER_DEMO',policy_revision='POLICY-001')
        result.append(pin)
    return result


@pytest.fixture
def database(): return LedgerDatabase()


def own(ledger, body=None):
    body = body or request()
    return ledger.admit('EXTERNAL_DEMO',body,str(uuid4()),pins(body))


def claim(ledger, receipt, index=0):
    return ledger.claim_send(receipt,index,target_id='PRINTER_DEMO',policy_revision='POLICY-001')


def assert_error(code, action):
    with pytest.raises(IntakeAdmissionError) as raised: action()
    assert raised.value.code == code


def test_canonical_numbers_unicode_order_matches_node():
    if not shutil.which('node'): pytest.skip('Node canonical differential NOT RUN.')
    values = [case['value'] for case in json.loads((ROOT/'tests/contracts/text_scalar_cases.json').read_text(encoding='utf-8'))
              if type(case['value']) in (int,float)]
    value = {'z':values,'a':{'\ue000':'a','\U00010000':'b'},'text':'"\\\n日本語','zero':-0.0,'b':False,'n':None}
    code = "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const f=x=>x&&typeof x==='object'?(Array.isArray(x)?'['+x.map(f).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+f(x[k])).join(',')+'}'):JSON.stringify(x);process.stdout.write(f(JSON.parse(s)))})"
    result = subprocess.run(['node','-e',code],input=json.dumps(value,ensure_ascii=False).encode(),capture_output=True,timeout=10,check=True)
    assert canonical_json(value).encode() == result.stdout


def test_digest_semantic_order_number_and_all_members():
    keys = LedgerKeys('k1',{'k1':b'A'*32})
    first = request('simulation')
    reordered = first.model_dump(); reordered['items'][0]['copies'] = 1.0
    reordered['items'][0]['data'] = {'SECRET':'synthetic-business-value','FLAG':False,'Z':-0.0}
    assert keys.values('EXTERNAL_DEMO',first) == keys.values('EXTERNAL_DEMO',IntakeRequest.model_validate(reordered))
    for mutation in ('mode','copies','data','items','field_descriptions'):
        value = first.model_dump()
        if mutation=='mode': value['mode']='print'
        elif mutation=='items': value['items'].reverse()
        elif mutation=='field_descriptions': value['field_descriptions']={'Z':'Description'}
        elif mutation=='copies': value['items'][0]['copies']=2
        else: value['items'][0]['data']['Z']=1
        assert keys.values('EXTERNAL_DEMO',first) != keys.values('EXTERNAL_DEMO',IntakeRequest.model_validate(value))
    assert 'AAAA' not in repr(keys)
    assert_error('sender_not_allowed',lambda:keys.values('OTHER',first))


def test_atomic_duplicate_admission_has_one_owner(database):
    barrier=Barrier(2); body=request()
    def compete():
        ledger=database.ledger(); barrier.wait(timeout=5)
        try: return own(ledger,body)
        except IntakeAdmissionError as error: return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(compete) for _ in range(2)]
        results=[future.result(timeout=10) for future in futures]
    assert sum(isinstance(value,Receipt) for value in results)==1
    assert 'request_in_progress' in results
    assert database.rows('SELECT identities FROM capacity')==[(1,)]
    assert database.rows('SELECT count(*) FROM requests')==[(1,)]


@pytest.mark.parametrize('mutation',['mode','copies','data','items','descriptions'])
def test_identity_collision_rejects_changed_input(database,mutation):
    ledger=database.ledger(); first=request(); own(ledger,first)
    changed=first.model_dump()
    if mutation=='mode': changed['mode']='simulation'
    elif mutation=='copies': changed['items'][0]['copies']=999
    elif mutation=='items': changed['items'].reverse()
    elif mutation=='descriptions': changed['field_descriptions']={'Z':'Different'}
    else: changed['items'][0]['data']['FLAG']=True
    assert_error('request_conflict',lambda:ledger.lookup('EXTERNAL_DEMO',IntakeRequest.model_validate(changed),str(uuid4())))


def test_http_simulation_replay_uses_original_pins_no_storage_or_raster(admitted,prepared):
    client=TestClient(app); body=envelope()
    first=client.post('/api/v1/label-intake',json=body)
    assert first.status_code==200
    admitted.values={'A':stored(version=42),'B':stored('B',version=99)}
    # Dependency is evaluated even for replay; use None to prove no storage service needed.
    app.dependency_overrides[http.stored_layouts]=lambda:None
    second=client.post('/api/v1/label-intake',json=body)
    assert second.status_code==200
    old,new=first.json(),second.json()
    assert new['replayed'] is True and old['replayed'] is False
    assert new['trace_id']!=old['trace_id'] and new['original_trace_id']==old['trace_id']
    assert new['results']==old['results'] and len(prepared)==2 and admitted.calls==['A','B']


def test_http_missing_or_unavailable_ledger_fail_closed(admitted,prepared):
    app.dependency_overrides[http.durable_ledger]=lambda:None
    response=TestClient(app).post('/api/v1/label-intake',json=envelope())
    assert response.status_code==503 and response.json()['detail']['code']=='ledger_unavailable'
    assert admitted.calls==[] and prepared==[]


def test_http_replay_checks_current_sender_authorization(admitted,prepared):
    client=TestClient(app); assert client.post('/api/v1/label-intake',json=envelope()).status_code==200
    def revoke(): raise IntakeAdmissionError(403,'sender_not_allowed')
    app.dependency_overrides[http.authorized_sender]=revoke
    assert client.post('/api/v1/label-intake',json=envelope()).status_code==403
    assert len(prepared)==2


@pytest.mark.parametrize('operation',['admit','prepared','claim','settle','terminal'])
@pytest.mark.parametrize('fault',['before','after'])
def test_commit_crash_matrix_never_auto_sends(database,operation,fault):
    ledger=database.ledger(); body=request(); receipt=None
    if operation!='admit': receipt=own(ledger,body)
    if operation in ('claim','settle','terminal'): ledger.prepared(receipt,0,'b'*64,100)
    if operation in ('settle','terminal'): assert claim(ledger,receipt) is True
    if operation=='terminal':
        ledger.settle_send(receipt,0,'SUBMITTED')
        ledger.fail_pre_send(receipt,1,'preflight_aborted',skipped=True)
    database.commit_fault=fault
    actions={
        'admit':lambda:own(ledger,body),
        'prepared':lambda:ledger.prepared(receipt,0,'b'*64,100),
        'claim':lambda:claim(ledger,receipt),
        'settle':lambda:ledger.settle_send(receipt,0,'SUBMITTED'),
        'terminal':lambda:ledger.complete_print(receipt)}
    assert_error('ledger_unavailable',actions[operation])
    rows=database.rows('SELECT ledger_id,state FROM requests')
    restarted=database.ledger()
    if not rows:
        assert operation=='admit' and fault=='before'
        assert restarted.lookup('EXTERNAL_DEMO',body,str(uuid4())) is None
        return
    ledger_id,state=rows[0]
    if state=='RECEIVED':
        assert_error('request_in_progress',lambda:restarted.lookup('EXTERNAL_DEMO',body,str(uuid4())))
        restarted.recover_quiesced(ledger_id)
    result=restarted.lookup('EXTERNAL_DEMO',body,str(uuid4()))
    assert result['replayed'] is True
    if operation in ('settle','terminal') or operation=='claim' and fault=='after':
        assert result['status'] in ('UNCERTAIN','PARTIAL')
        if state=='RECEIVED': assert result['results'][0]['status']=='UNCERTAIN'
    else: assert result['status']=='FAILED'
    if receipt:
        assert_error('ledger_unavailable',lambda:claim(restarted,receipt))


def test_duplicate_claim_and_post_uncertainty_claim_are_denied(database):
    ledger=database.ledger(); receipt=own(ledger)
    ledger.prepared(receipt,0,'b'*64,100); ledger.prepared(receipt,1,'c'*64,100)
    assert_error('ledger_unavailable',lambda:claim(ledger,receipt,1))
    assert claim(ledger,receipt) is True
    assert_error('ledger_unavailable',lambda:claim(ledger,receipt))
    ledger.settle_send(receipt,0,'UNCERTAIN')
    assert_error('ledger_unavailable',lambda:claim(ledger,receipt,1))
    ledger.complete_print(receipt)
    result=ledger.lookup('EXTERNAL_DEMO',request(),str(uuid4()))
    assert result['status']=='UNCERTAIN' and [item['status'] for item in result['results']]==['UNCERTAIN','SKIPPED']
    assert result['results'][0]['confirmed'] is False


def test_success_replay_after_repository_restart_no_second_claim(database):
    ledger=database.ledger(); body=request(); receipt=own(ledger,body)
    for index in (0,1):
        ledger.prepared(receipt,index,'b'*64,100)
        assert claim(ledger,receipt,index) is True
        ledger.settle_send(receipt,index,'SUBMITTED')
    ledger.complete_print(receipt)
    restarted=database.ledger()
    result=restarted.lookup('EXTERNAL_DEMO',body,str(uuid4()))
    assert result['status']=='COMPLETED' and result['summary']['submitted']==2
    assert_error('ledger_unavailable',lambda:claim(restarted,receipt))
    assert database.rows('SELECT count(*) FROM simulation_results')==[(0,)]


def test_route_and_simulation_terminal_commit_failure_are_not_success(admitted,prepared):
    database=LedgerDatabase(); ledger=database.ledger()
    app.dependency_overrides[http.durable_ledger]=lambda:ledger
    database.fail_sql='INSERT INTO label_intake.simulation_results'
    first=TestClient(app).post('/api/v1/label-intake',json=envelope())
    assert first.status_code==503 and first.json()['detail']['code']=='ledger_unavailable'
    assert database.rows('SELECT state FROM items ORDER BY item_index')==[('PREPARED',),('PREPARED',)]
    database.fail_sql=None
    repeated=TestClient(app).post('/api/v1/label-intake',json=envelope())
    assert repeated.status_code==409 and repeated.json()['detail']['code']=='request_in_progress'
    assert len(prepared)==2
    ledger.recover_quiesced(database.rows('SELECT ledger_id FROM requests')[0][0])
    recovered=TestClient(app).post('/api/v1/label-intake',json=envelope())
    assert recovered.status_code==200 and recovered.json()['status']=='FAILED' and len(prepared)==2


@pytest.mark.parametrize('mode,retention',[('simulation',86400),('print',90*86400)])
def test_expiry_tombstone_and_key_rotation_never_reuses_identity(database,mode,retention):
    now=[1000.0]; ledger=database.ledger(clock=lambda:now[0]); body=request(mode); receipt=own(ledger,body)
    ledger.recover_quiesced(receipt.ledger_id)
    now[0]+=retention
    assert_error('request_expired',lambda:ledger.lookup('EXTERNAL_DEMO',body,str(uuid4())))
    ledger.expire(receipt.ledger_id)
    rotated=database.ledger(LedgerKeys('k2',{'k1':b'A'*32,'k2':b'B'*32}),clock=lambda:now[0])
    assert_error('request_expired',lambda:own(rotated,body))
    assert database.rows('SELECT identities FROM capacity')==[(1,)]
    assert database.rows('SELECT state,outcome,metadata FROM requests')==[('EXPIRED','FAILED',None)]
    assert database.rows('SELECT count(*) FROM items')==[(0,)]
    forgotten=database.ledger(LedgerKeys('k2',{'k2':b'B'*32}),clock=lambda:now[0])
    assert_error('ledger_unavailable',lambda:own(forgotten,body))


def test_quota_includes_tombstones_and_no_arbitrary_eviction(database):
    connection=database.connect()
    try:
        connection.connection.execute('UPDATE capacity SET identities=1000000')
        connection.commit()
    finally:
        connection.close()
    assert_error('ledger_unavailable',lambda:own(database.ledger()))
    assert database.rows('SELECT count(*) FROM requests')==[(0,)]


def test_sql_and_rollback_fault_discard_connection_without_claim(database):
    ledger=database.ledger(); receipt=own(ledger)
    ledger.prepared(receipt,0,'b'*64,100)
    database.fail_sql='UPDATE label_intake.items'; database.rollback_fault=True
    assert_error('ledger_unavailable',lambda:claim(ledger,receipt))
    assert database.closed==3
    assert database.rows('SELECT state FROM items ORDER BY item_index')==[('PREPARED',),('RECEIVED',)]


def test_no_raw_input_key_external_request_id_payload_or_png_in_print_ledger(database):
    ledger=database.ledger(); body=request(); receipt=own(ledger,body)
    ledger.prepared(receipt,0,'b'*64,100)
    assert claim(ledger,receipt) is True
    ledger.settle_send(receipt,0,'UNCERTAIN'); ledger.complete_print(receipt)
    raw=repr(database.rows('SELECT * FROM requests')+database.rows('SELECT * FROM items'))
    assert 'synthetic-business-value' not in raw and 'REQ-001' not in raw and 'AAAA' not in raw
    assert 'png_base64' not in raw and 'data' not in json.loads(database.rows('SELECT metadata FROM items')[0][0])


def test_pinned_target_revision_cannot_change_at_claim(database):
    ledger=database.ledger(); receipt=own(ledger); ledger.prepared(receipt,0,'b'*64,100)
    assert_error('ledger_unavailable',lambda:ledger.claim_send(receipt,0,target_id='OTHER',policy_revision='POLICY-001'))
    assert_error('ledger_unavailable',lambda:ledger.claim_send(receipt,0,target_id='PRINTER_DEMO',policy_revision='OTHER'))


def test_bounded_pin_metadata_rejects_smuggled_raw_data(database):
    ledger=database.ledger(); body=request(); values=pins(body)
    values[0]['media']['secret']='synthetic-business-value'
    assert_error('ledger_unavailable',lambda:ledger.admit('EXTERNAL_DEMO',body,str(uuid4()),values))
    assert database.rows('SELECT count(*) FROM requests')==[(0,)]


def test_changing_secret_under_existing_version_denies_reuse(database):
    own(database.ledger())
    changed=database.ledger(LedgerKeys('k1',{'k1':b'Z'*32}))
    assert_error('ledger_unavailable',lambda:own(changed))
    assert database.rows('SELECT identities FROM capacity')==[(1,)]


def test_expiry_does_not_erase_unresolved_claim_evidence(database):
    now=[0.0]; ledger=database.ledger(clock=lambda:now[0]); receipt=own(ledger)
    ledger.prepared(receipt,0,'b'*64,100); claim(ledger,receipt)
    now[0]=90*86400
    assert_error('ledger_unavailable',lambda:ledger.expire(receipt.ledger_id))
    assert database.rows('SELECT state FROM items ORDER BY item_index')==[('SEND_CLAIMED',),('RECEIVED',)]


def test_corrupt_stored_result_is_not_disclosed_or_recomputed(database):
    ledger=database.ledger(); receipt=own(ledger); ledger.recover_quiesced(receipt.ledger_id)
    connection=database.connect()
    try:
        connection.connection.execute('UPDATE requests SET metadata=?', ('{"private":"synthetic-secret"}',))
        connection.commit()
    finally: connection.close()
    assert_error('ledger_unavailable',lambda:ledger.lookup('EXTERNAL_DEMO',request(),str(uuid4())))


def test_two_concurrent_send_claims_have_one_committed_owner(database):
    ledger=database.ledger(); receipt=own(ledger); ledger.prepared(receipt,0,'b'*64,100)
    barrier=Barrier(2)
    def compete():
        other=database.ledger(); barrier.wait(timeout=5)
        try: return claim(other,receipt)
        except LedgerUnavailable: return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(compete) for _ in range(2)]
        assert [future.result(timeout=10) for future in futures].count(True)==1
    assert database.rows('SELECT state FROM items ORDER BY item_index')==[('SEND_CLAIMED',),('RECEIVED',)]


def test_foreign_owner_and_unprepared_item_cannot_claim(database):
    ledger=database.ledger(); receipt=own(ledger)
    assert_error('ledger_unavailable',lambda:claim(ledger,receipt))
    ledger.prepared(receipt,0,'b'*64,100)
    foreign=Receipt(receipt.ledger_id,str(uuid4()),receipt.original_trace_id,receipt.mode)
    assert_error('ledger_unavailable',lambda:claim(ledger,foreign))


def test_server_result_rejects_unbounded_or_private_error_text():
    from app.label_intake.results import IntakeError
    with pytest.raises(ValueError):
        IntakeError(stage='RECOVERY',code='processing_failed',message='synthetic-private-details')
