"""Synthetic credentials, audited policy, replay and pre-claim guards; no network IO."""
from datetime import datetime, timezone
import json
import socket
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import app
from app.label_intake import http, service
from app.label_intake.policy import (Policy, Admission, ApprovalEvent, Source, Target,
    PolicyDenied, authenticate, authorize, load_policy, preflight_print,
    revalidate_claim, validate_transition)
from app.label_intake.results import IntakeAdmissionError, IntakeRequest, TemplateEvidence
from tests.test_label_intake import envelope, Layouts, prepared
from tests.intake_ledger_fake import LedgerDatabase

TOKEN = 'synthetic_token_for_unit_tests_only_0001'
ENV = 'TLS_INTAKE_TOKEN_DEMO'
STAMP = datetime(2026, 10, 10, tzinfo=timezone.utc)
EVIDENCE = TemplateEvidence(version=1, svg_sha256='a' * 64)


def source(**changes):
    return Source(**dict(identity='EXTERNAL_DEMO', credential_env=ENV, enabled=True,
                         modes=('simulation', 'print'), label_codes=('A', 'B'), print_target_id=None, allowed_print_target_ids=('PRINTER_DEMO',), print_max_copies=999) | changes)


def event(**changes):
    return ApprovalEvent(**dict(event_id='E1', actor='LOCAL_ADMIN', at=STAMP, action='approve',
        sender='EXTERNAL_DEMO', label_code='A', version=1, svg_sha256='a' * 64,
        target_id='PRINTER_DEMO', max_copies=999) | changes)


def policy(**changes):
    return Policy(**dict(revision='P1', sources=(source(),),
        targets=(Target(target_id='PRINTER_DEMO', host='192.0.2.44', port=9100, enabled=True),),
        audit=(event(),)) | changes)


def auth(p=None):
    return authenticate(p or policy(), 'Bearer ' + TOKEN, {ENV: TOKEN})


def denial(code, action):
    with pytest.raises((PolicyDenied, IntakeAdmissionError)) as raised:
        action()
    actual = raised.value.detail.code if isinstance(raised.value, PolicyDenied) else raised.value.code
    assert actual == code
    assert TOKEN not in str(raised.value)


@pytest.fixture
def runtime(monkeypatch):
    monkeypatch.setenv(ENV, TOKEN)
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', policy().model_dump_json())
    # Tests own a disposable synthetic config, not configured storage/services.
    previous = getattr(app.state, 'intake_policy_previous', None)
    if hasattr(app.state, 'intake_policy_previous'):
        del app.state.intake_policy_previous
    yield TestClient(app)
    if hasattr(app.state, 'intake_policy_previous'):
        del app.state.intake_policy_previous
    if previous is not None:
        app.state.intake_policy_previous = previous


@pytest.mark.parametrize('header,status,code', [
    (None,401,'unauthenticated'), ('Basic '+TOKEN,401,'unauthenticated'),
    ('Bearer wrong',401,'unauthenticated'), ('Bearer '+'x'*40,401,'unauthenticated'),
    ('Bearer '+TOKEN+' extra',401,'unauthenticated')])
def test_http_identity_denial_before_dependencies(runtime, monkeypatch, header, status, code):
    monkeypatch.setattr(service, 'prepare_draft_output', lambda *a: pytest.fail('render'))
    monkeypatch.setattr(socket, 'create_connection', lambda *a: pytest.fail('socket'))
    app.dependency_overrides[http.stored_layouts] = lambda: pytest.fail('storage')
    app.dependency_overrides[http.durable_ledger] = lambda: pytest.fail('ledger')
    try:
        response = runtime.post('/api/v1/label-intake', json=envelope(),
                                headers={} if header is None else {'Authorization': header})
        assert response.status_code == status and response.json()['detail']['code'] == code
        assert response.headers['www-authenticate'] == 'Bearer'
        assert TOKEN not in response.text
    finally:
        app.dependency_overrides.pop(http.stored_layouts)
        app.dependency_overrides.pop(http.durable_ledger)


@pytest.mark.parametrize('change,code', [
    ({'enabled':False},'sender_not_allowed'),
    ({'modes':('print',)},'mode_not_allowed')])
def test_http_capability_denied_before_storage(runtime, monkeypatch, change, code):
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', policy(sources=(source(**change),)).model_dump_json())
    app.dependency_overrides[http.stored_layouts] = lambda: pytest.fail('storage')
    try:
        response=runtime.post('/api/v1/label-intake', json=envelope(), headers={'Authorization':'Bearer '+TOKEN})
        assert response.status_code == 403 and response.json()['detail']['code'] == code
    finally:
        app.dependency_overrides.pop(http.stored_layouts)


def test_asserted_sender_cannot_authenticate(runtime):
    body=envelope(); body['sender']['system']='OTHER'
    response=runtime.post('/api/v1/label-intake',json=body,headers={'Authorization':'Bearer '+TOKEN})
    assert response.status_code==403 and response.json()['detail']['code']=='sender_not_allowed'
    response=runtime.post('/api/v1/label-intake',json=envelope(),
        headers=[('Authorization','Bearer '+TOKEN),('Authorization','Bearer '+TOKEN)])
    assert response.status_code==401


@pytest.mark.parametrize('legacy', [dict(label_codes=(), simulation_all_label_codes=False), dict(label_codes=('A',), simulation_all_label_codes=True)])
def test_all_templates_allowed_for_both_modes_independent_of_legacy_scope(legacy):
    admission = auth(policy(sources=(source(**legacy),)))
    body = envelope(('NEW_TEMPLATE',))
    for mode in ('simulation', 'print'):
        body['mode'] = mode
        authorize(admission, IntakeRequest.model_validate(body))
    assert preflight_print(admission, 'NEW_TEMPLATE', EVIDENCE, 1, 'PRINTER_DEMO').label_code == 'NEW_TEMPLATE'
    body['sender']['system'] = 'OTHER'
    denial('sender_not_allowed', lambda: authorize(admission, IntakeRequest.model_validate(body)))
    print_only = auth(policy(sources=(source(modes=('print',)),)))
    denial('mode_not_allowed', lambda: authorize(print_only, IntakeRequest.model_validate(envelope())))


def test_source_template_scope_can_be_omitted():
    values = source().model_dump(mode='json')
    del values['label_codes']
    del values['simulation_all_label_codes']
    configured = Source.model_validate_json(json.dumps(values))
    assert configured.label_codes == ()
    authorize(auth(policy(sources=(configured,))), IntakeRequest.model_validate(envelope(('OTHER',))))

def test_all_templates_unknown_code_fails_and_disabling_mode_blocks_replay(runtime, monkeypatch, prepared):
    layouts = Layouts()
    database = LedgerDatabase()
    app.dependency_overrides[http.stored_layouts] = lambda: layouts
    app.dependency_overrides[http.durable_ledger] = lambda: database.ledger()
    try:
        monkey_policy = policy(revision='ALL1', sources=(source(label_codes=(), simulation_all_label_codes=True),))
        monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', monkey_policy.model_dump_json())
        body = envelope(('MISSING_TEMPLATE',))
        headers = {'Authorization': 'Bearer ' + TOKEN}
        first = runtime.post('/api/v1/label-intake', json=body, headers=headers)
        assert first.status_code == 200
        assert first.json()['results'][0]['error']['code'] == 'unknown_label_code'
        assert first.json()['results'][0]['status'] == 'FAILED'
        repeated = runtime.post('/api/v1/label-intake', json=body, headers=headers)
        assert repeated.json()['replayed'] is True
        existing = envelope(('A',))
        existing['request_id'] = 'ALL-EXISTING-001'
        successful = runtime.post('/api/v1/label-intake', json=existing, headers=headers)
        assert successful.status_code == 200 and successful.json()['results'][0]['status'] == 'SIMULATED'
        assert len(prepared) == 1
        monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', policy(revision='ALL2', sources=(source(label_codes=(), modes=('print',)),)).model_dump_json())
        assert runtime.post('/api/v1/label-intake', json=body, headers=headers).status_code == 403
        assert runtime.post('/api/v1/label-intake', json=existing, headers=headers).status_code == 403
    finally:
        app.dependency_overrides.pop(http.stored_layouts)
        app.dependency_overrides.pop(http.durable_ledger)


def test_configured_print_requires_durable_ledger_before_storage_read(runtime, monkeypatch):
    monkeypatch.setattr(service,'prepare_draft_output',lambda *a:pytest.fail('render'))
    layouts=Layouts()
    app.dependency_overrides[http.stored_layouts]=lambda:layouts
    app.dependency_overrides[http.durable_ledger]=lambda:None
    try:
        body=envelope(); body['mode']='print'
        response=runtime.post('/api/v1/label-intake',json=body,headers={'Authorization':'Bearer '+TOKEN})
        assert response.status_code==503 and response.json()['detail']['code']=='ledger_unavailable'
        assert layouts.calls==[]
    finally:
        app.dependency_overrides.pop(http.stored_layouts)
        app.dependency_overrides.pop(http.durable_ledger)


@pytest.mark.parametrize('revoke',['source','token','mode'])
def test_real_auth_replay_rechecks_current_permissions(runtime, prepared, monkeypatch, revoke):
    layouts=Layouts(); ledger=LedgerDatabase().ledger()
    app.dependency_overrides[http.stored_layouts]=lambda:layouts
    app.dependency_overrides[http.durable_ledger]=lambda:ledger
    try:
        headers={'Authorization':'Bearer '+TOKEN}
        first=runtime.post('/api/v1/label-intake',json=envelope(),headers=headers)
        assert first.status_code==200
        second=runtime.post('/api/v1/label-intake',json=envelope(),headers=headers)
        assert second.status_code==200 and second.json()['replayed']
        changes={'source':{'enabled':False},'mode':{'modes':('print',)},'code':{'label_codes':('A',)}}
        if revoke=='token': monkeypatch.setenv(ENV,'rotated_synthetic_unit_test_token_0002')
        else: monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',policy(revision='P2',sources=(source(**changes[revoke]),)).model_dump_json())
        denied=runtime.post('/api/v1/label-intake',json=envelope(),headers=headers)
        assert denied.status_code==(401 if revoke=='token' else 403)
        assert len(prepared)==2 and layouts.calls==['A','B']
    finally:
        app.dependency_overrides.pop(http.stored_layouts)
        app.dependency_overrides.pop(http.durable_ledger)


@pytest.mark.parametrize('host',['192.0.2.44','2001:db8::44'])
@pytest.mark.parametrize('copies',[1,999])
def test_preflight_target_deterministic_and_no_effects(monkeypatch, host, copies):
    monkeypatch.setattr(socket,'create_connection',lambda *a:pytest.fail('socket'))
    monkeypatch.setattr(service,'prepare_draft_output',lambda *a:pytest.fail('render'))
    p=policy(targets=(Target(target_id='PRINTER_DEMO',host=host,port=9100,enabled=True),))
    pin=preflight_print(auth(p),'A',EVIDENCE,copies, 'PRINTER_DEMO')
    assert pin.target.host==host and pin.target_id=='PRINTER_DEMO' and pin.policy_revision=='P1'
    assert pin==preflight_print(auth(p),'A',EVIDENCE,copies, 'PRINTER_DEMO')
    assert revalidate_claim(pin,auth(p),p,{ENV:TOKEN})==pin


@pytest.mark.parametrize('p,template,copies,code', [
    (policy(sources=(source(enabled=False),)),EVIDENCE,1,'sender_not_allowed'),
    (policy(sources=(source(modes=('simulation',)),)),EVIDENCE,1,'template_not_allowed'),
    (policy(sources=(source(print_max_copies=10),)),EVIDENCE,11,'copies_not_allowed'),
    (policy(),EVIDENCE,True,'copies_not_allowed'),
    (policy(),EVIDENCE,1000,'copies_not_allowed'),
    (policy(sources=(source(allowed_print_target_ids=()),)),EVIDENCE,1,'target_not_allowed'),
    (policy(targets=()),EVIDENCE,1,'target_not_allowed'),
    (policy(targets=(Target(target_id='PRINTER_DEMO',host='192.0.2.44',port=9100,enabled=False),)),EVIDENCE,1,'target_not_allowed')])
def test_unconfigured_or_unavailable_preflight_zero_operations(monkeypatch,p,template,copies,code):
    before=p.model_dump_json()
    monkeypatch.setattr(service,'prepare_draft_output',lambda *a:pytest.fail('render'))
    monkeypatch.setattr(socket,'create_connection',lambda *a:pytest.fail('socket'))
    denial(code,lambda:preflight_print(auth(p),'A',template,copies, 'PRINTER_DEMO'))
    assert p.model_dump_json()==before


@pytest.mark.parametrize('target',[
    {'host':'printer.example','port':9100},{'host':'0.0.0.0','port':9100},
    {'host':'224.0.0.1','port':9100},{'host':'fe80::1%eth0','port':9100},
    {'host':'192.0.2.44','port':True},{'host':'192.0.2.44','port':'9100'},
    {'host':'192.0.2.44','port':0},{'host':'192.0.2.44','port':65536}])
def test_invalid_config_target_fails_closed(target):
    raw=json.loads(policy().model_dump_json());raw['targets'][0].update(target)
    denial('policy_unavailable',lambda:load_policy({'TLS_INTAKE_POLICY_JSON':json.dumps(raw)}))


def test_payload_network_values_are_label_data_only():
    body=envelope(('A',));body['mode']='print'
    body['items'][0]['data']={'host':'203.0.113.99','port':1234,'target_id':'UNTRUSTED'}
    request=IntakeRequest.model_validate(body);admission=auth();authorize(admission,request)
    pin=preflight_print(admission,'A',EVIDENCE,1, 'PRINTER_DEMO')
    assert pin.target.host=='192.0.2.44' and pin.target.port==9100
    body['items'][0]['target']={'host':'203.0.113.99','port':1234}
    with pytest.raises(ValueError): IntakeRequest.model_validate(body)


@pytest.mark.parametrize('change', ['revision','address','port','revoke','capability','token'])
def test_changed_policy_or_credential_stops_claim(change):
    original=auth();pin=preflight_print(original,'A',EVIDENCE,999, 'PRINTER_DEMO');p=policy();values={ENV:TOKEN}
    if change=='revision':p=policy(revision='P2')
    elif change in ('address','port'):
        p=policy(targets=(Target(target_id='PRINTER_DEMO',host='2001:db8::9' if change=='address' else '192.0.2.44',port=9999 if change=='port' else 9100,enabled=True),))
    elif change=='revoke':p=policy(sources=(source(allowed_print_target_ids=()),))
    elif change=='capability':p=policy(sources=(source(modes=('simulation',)),))
    else:values={ENV:'rotated_synthetic_unit_test_token_0002'}
    denial('target_not_allowed' if change in ('revision','address','port','revoke') else 'template_not_allowed',
           lambda:revalidate_claim(pin,original,p,values))


def test_audit_history_and_revision_are_enforced_on_environment_reload(runtime,monkeypatch):
    first=http.configured_policy(SimpleNamespace(app=app))
    revoked=policy(revision='P2',audit=(event(),event(event_id='E2',action='revoke')))
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',revoked.model_dump_json())
    assert http.configured_policy(SimpleNamespace(app=app))==revoked
    for candidate in (policy(revision='P3'),policy(revision='P2',targets=())):
        monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',candidate.model_dump_json())
        denial('policy_unavailable',lambda:http.configured_policy(SimpleNamespace(app=app)))
    assert validate_transition(first,revoked)==revoked


@pytest.mark.parametrize('raw',['','{}','{"revision":"P1","revision":"P2"}', 'NaN'])
def test_missing_corrupt_duplicate_policy_static_errors(raw):
    denial('policy_unavailable',lambda:load_policy({'TLS_INTAKE_POLICY_JSON':raw}))


def test_bad_secrets_duplicates_no_secret_repr_or_unbounded_error():
    for values in ({},{ENV:'too-short'}):
        denial('unauthenticated',lambda:authenticate(policy(),'Bearer '+TOKEN,values))
    other=source(identity='OTHER',credential_env='TLS_INTAKE_TOKEN_OTHER')
    denial('unauthenticated',lambda:authenticate(policy(sources=(source(),other)),
        'Bearer '+TOKEN,{ENV:TOKEN,'TLS_INTAKE_TOKEN_OTHER':TOKEN}))
    assert TOKEN not in repr(auth())
    with pytest.raises(ValidationError):policy(sources=(source(),source()))
    with pytest.raises(ValidationError):policy(audit=(event(at=STAMP.replace(tzinfo=None)),))
    with pytest.raises(ValidationError):policy().revision='EDIT'


def test_bearer_security_is_only_on_intake_openapi():
    schema=app.openapi();paths=schema['paths']
    assert paths['/api/v1/label-intake']['post']['security']==[{'HTTPBearer':[]}]
    assert 'security' not in paths['/api/v1/printing/editor']['post']
    assert 'security' not in paths['/api/v1/printing/target']['get']


def test_missing_policy_valid_bearer_denies_before_storage(runtime, monkeypatch):
    monkeypatch.delenv('TLS_INTAKE_POLICY_JSON')
    app.dependency_overrides[http.stored_layouts]=lambda:pytest.fail('storage')
    try:
        response=runtime.post('/api/v1/label-intake',json=envelope(),headers={'Authorization':'Bearer '+TOKEN})
        assert response.status_code==503 and response.json()['detail']['code']=='policy_unavailable'
    finally:
        app.dependency_overrides.pop(http.stored_layouts)


def test_policy_pin_passes_to_committed_ledger_without_bypassing_claim():
    from uuid import uuid4
    from app.label_intake.ledger import Receipt
    original=auth();pin=preflight_print(original,'A',EVIDENCE,999, 'PRINTER_DEMO')
    body=envelope(('A',),copies=999);body['mode']='print'
    request=IntakeRequest.model_validate(body)
    ledger=LedgerDatabase().ledger()
    pins=[dict(item_index=0,item_id='I0',label_code='A',copies=999,
               template=pin.template.model_dump(),media=dict(width_mm=40,height_mm=30,dpi=203),
               target_id=pin.target_id,policy_revision=pin.policy_revision)]
    receipt=ledger.admit(pin.sender,request,str(uuid4()),pins)
    assert isinstance(receipt,Receipt)
    denial('ledger_unavailable',lambda:ledger.claim_send(receipt,0,target_id=pin.target_id,policy_revision=pin.policy_revision))
    ledger.prepared(receipt,0,'b'*64,100)
    denial('ledger_unavailable',lambda:ledger.claim_send(receipt,0,target_id='OTHER',policy_revision=pin.policy_revision))
    checked=revalidate_claim(pin,original,policy(),{ENV:TOKEN})
    assert ledger.claim_send(receipt,0,target_id=checked.target_id,policy_revision=checked.policy_revision)
    denial('ledger_unavailable',lambda:ledger.claim_send(receipt,0,target_id=checked.target_id,policy_revision=checked.policy_revision))


def test_documentation_example_loads_without_credential_and_cannot_print():
    from pathlib import Path
    path=Path(__file__).resolve().parents[2]/'docs/implementation/universal-label-pipeline/T09_POLICY_OPERATIONS.md'
    text=path.read_text(encoding='utf-8')
    raw=text.split('```json\n',1)[1].split('```',1)[0]
    p=load_policy({'TLS_INTAKE_POLICY_JSON':raw})
    assert p.sources[0].modes==('simulation',) and not p.targets[0].enabled
    assert TOKEN not in text and '192.168.' not in text
    denial('template_not_allowed',lambda:preflight_print(auth(p),'ROLL_DEMO',EVIDENCE,1, 'PRINTER_DEMO'))


def test_configured_routing_needs_no_approval_for_any_valid_stored_version():
    for evidence in (EVIDENCE, TemplateEvidence(version=7, svg_sha256='b' * 64)):
        configured = policy(audit=())
        pin = preflight_print(auth(configured), 'A', evidence, 10, 'PRINTER_DEMO')
        assert pin.template == evidence and pin.target_id == 'PRINTER_DEMO'
        historical = policy(audit=(event(), event(event_id='E2', action='revoke')))
        assert preflight_print(auth(historical), 'A', evidence, 10, 'PRINTER_DEMO').target_id == pin.target_id


@pytest.mark.parametrize('changes', [dict(print_max_copies=True), dict(print_max_copies=0), dict(print_max_copies=1000), dict(print_target_id='bad id')])
def test_invalid_source_routing_is_rejected(changes):
    with pytest.raises(ValidationError): source(**changes)
