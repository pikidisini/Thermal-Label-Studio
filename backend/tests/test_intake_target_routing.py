"""Logical target authorization, canonical identity and no-send boundaries."""
import json
from dataclasses import replace
import pytest
from .auth_test_support import TestClient
from app.main import app
from app.label_intake import http, print_service
from app.label_intake.identity import LedgerKeys, canonical_json
from app.label_intake.policy import Target, authenticate, authorize, preflight_print, revalidate_claim, PolicyDenied
from app.label_intake.results import IntakeRequest, IntakeAdmissionError
from app.label_data.validation import admit_json, LabelDataError
from app.management.integrations.service import upsert_source
from app.management.printers.service import delete_target
from app.management.errors import ManagementError
from tests.test_intake_policy import policy, source, auth, EVIDENCE, ENV, TOKEN
from tests.test_label_intake import envelope, Layouts, prepared
from tests.intake_ledger_fake import LedgerDatabase
from tests.test_intake_print import Recorder


def configured():
    a = Target(target_id='TARGET_A', host='127.0.0.1', port=19100, enabled=True)
    b = Target(target_id='TARGET_B', host='127.0.0.1', port=19101, enabled=True)
    c = Target(target_id='TARGET_C', host='127.0.0.1', port=19102, enabled=True)
    return policy(targets=(a,b,c), sources=(source(allowed_print_target_ids=(a.target_id,b.target_id)),))


def request(target='TARGET_A'):
    body = envelope(('A',), 1); body['mode'] = 'print'
    if target is not None: body['target_id'] = target
    else: body.pop('target_id',None)
    return body


@pytest.mark.parametrize('mode', ['print','simulation'])
def test_target_is_required_and_identity_includes_explicit_target(mode):
    with pytest.raises(ValueError): IntakeRequest.model_validate({**request(None),'mode':mode})
    raw={**request('TARGET_A'),'mode':mode};model=IntakeRequest.model_validate(raw)
    expected={**raw,'field_descriptions':{}}
    assert model.model_dump()==expected
    keys=LedgerKeys('k',{'k':b'X'*32})
    identity,digest=keys.values(raw['sender']['system'],model)['k']
    selected=IntakeRequest.model_validate({**raw,'target_id':'TARGET_B'})
    assert keys.values(raw['sender']['system'],selected)['k'][0]==identity
    assert keys.values(raw['sender']['system'],selected)['k'][1]!=digest


@pytest.mark.parametrize('value', [None, '', ' target', 'http://127.0.0.1:19100', {'host':'127.0.0.1'}])
def test_invalid_target_shapes_rejected(value):
    with pytest.raises((LabelDataError, ValueError)):
        admit_json(json.dumps({**request(), 'target_id':value}).encode())


def test_simulation_validates_the_same_explicit_target():
    p=configured()
    model=IntakeRequest.model_validate({**request('TARGET_B'),'mode':'simulation'})
    authorize(auth(p),model)
    with pytest.raises(IntakeAdmissionError):
        authorize(auth(p),IntakeRequest.model_validate({**request('TARGET_C'),'mode':'simulation'}))
    with pytest.raises(PolicyDenied):preflight_print(auth(p),'A',EVIDENCE,1)
    legacy=p.model_copy(update={'sources':(source(print_target_id='TARGET_A',allowed_print_target_ids=()),)})
    with pytest.raises(PolicyDenied):preflight_print(auth(legacy),'A',EVIDENCE,1,'TARGET_A')


def test_default_additional_and_permission_revocation():
    p = configured(); admission = auth(p)
    default = preflight_print(admission, 'A', EVIDENCE, 1, 'TARGET_A')
    explicit = preflight_print(admission, 'A', EVIDENCE, 1, 'TARGET_B')
    assert default.target_id == 'TARGET_A'
    assert explicit.target_id == 'TARGET_B'
    assert revalidate_claim(explicit, admission, p, {ENV:TOKEN}) == explicit
    revoked = p.model_copy(update={'sources':(p.sources[0].model_copy(update={'allowed_print_target_ids':()}),)})
    with pytest.raises(PolicyDenied): revalidate_claim(explicit, admission, revoked, {ENV:TOKEN})
    disabled = p.model_copy(update={'targets':tuple(t.model_copy(update={'enabled':False}) if t.target_id=='TARGET_B' else t for t in p.targets)})
    with pytest.raises(PolicyDenied): preflight_print(auth(disabled), 'A', EVIDENCE, 1, 'TARGET_B')
    with pytest.raises(IntakeAdmissionError) as raised: authorize(admission, IntakeRequest.model_validate(request('TARGET_C')))
    assert (raised.value.status,raised.value.code) == (403,'target_not_allowed')


def test_changed_target_and_route_rechecked_before_claim():
    p=configured(); admission=auth(p)
    explicit=preflight_print(admission,'A',EVIDENCE,1,'TARGET_B')
    changed=p.model_copy(update={'targets':tuple(t.model_copy(update={'port':19103}) if t.target_id=='TARGET_B' else t for t in p.targets)})
    with pytest.raises(PolicyDenied): revalidate_claim(explicit, admission, changed, {ENV:TOKEN})


def test_http_target_choice_replay_and_conflict(monkeypatch):
    p=configured(); database=LedgerDatabase(); recorder=Recorder(database)
    monkeypatch.setenv(ENV,TOKEN); monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_dump_json())
    # A deterministic prepared output keeps this test focused on routing/ledger.
    from io import BytesIO
    from PIL import Image
    from app.engine.pipeline import prepare_bitmap
    from app.engine.bitmap import RenderedLabel
    def prepare(r):
        width=round(r.draft.width_mm*r.draft.dpi/25.4); height=round(r.draft.height_mm*r.draft.dpi/25.4)
        image=BytesIO(); Image.new('1',(width,height),1).save(image,format='PNG',dpi=(r.draft.dpi,r.draft.dpi))
        return None,prepare_bitmap(RenderedLabel('editor','current',width,height,r.draft.dpi,image.getvalue()),copies=r.copies)
    monkeypatch.setattr(print_service,'prepare_draft_output',prepare)
    monkeypatch.delattr(app.state,'intake_policy_previous',raising=False)
    app.dependency_overrides[http.stored_layouts]=lambda:Layouts()
    app.dependency_overrides[http.durable_ledger]=lambda:database.ledger()
    app.dependency_overrides[http.intake_transport_factory]=lambda:recorder.factory
    client=TestClient(app)
    headers={'Authorization':'Bearer '+TOKEN}
    try:
        body=request('TARGET_B')
        first=client.post('/api/v1/label-intake',json=body,headers=headers)
        assert first.status_code==200,first.text
        assert first.json()['results'][0]['status']=='SUBMITTED',first.text
        assert first.json()['results'][0]['target_id']=='TARGET_B'
        assert recorder.constructed[0].port==19101
        replay=client.post('/api/v1/label-intake',json=body,headers=headers)
        assert replay.json()['replayed'] is True
        assert len(recorder.calls)==1
        conflict=client.post('/api/v1/label-intake',json={**body,'target_id':'TARGET_A'},headers=headers)
        assert conflict.status_code==409 and conflict.json()['detail']['code']=='request_conflict'
        denied=client.post('/api/v1/label-intake',json={**body,'request_id':'DENIED','target_id':'TARGET_C'},headers=headers)
        assert denied.status_code==403
        assert len(recorder.calls)==1
    finally:
        client.close(); app.dependency_overrides.clear()


def test_management_references_and_duplicate_grants(monkeypatch):
    from tests.test_management import seed, TOKEN as MANAGEMENT_TOKEN
    from pydantic import ValidationError
    document=seed()
    target=Target(target_id='EXTRA',host='127.0.0.1',port=19101,enabled=True)
    document.policy=document.policy.model_copy(update={'targets':document.policy.targets+(target,)})
    monkeypatch.setenv('TLS_INTAKE_TOKEN_DEMO',MANAGEMENT_TOKEN)
    original=document.policy.sources[0]
    changed=original.model_copy(update={'allowed_print_target_ids':('EXTRA',)})
    upsert_source(document,changed)
    assert document.policy.sources[0].allowed_print_target_ids==('EXTRA',)
    with pytest.raises(ManagementError) as blocked: delete_target(document,'EXTRA')
    assert blocked.value.code=='printer_in_use'
    with pytest.raises(ManagementError): upsert_source(document,original.model_copy(update={'allowed_print_target_ids':('UNKNOWN',)}))
    with pytest.raises(ValidationError): source(allowed_print_target_ids=('A','A'))


@pytest.mark.parametrize('mode',['simulation','print'])
def test_http_requires_target_and_denies_inactive_unknown_unpermitted_before_processing(monkeypatch,mode):
    p=configured()
    monkeypatch.setenv(ENV,TOKEN);monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_dump_json())
    monkeypatch.delattr(app.state,'intake_policy_previous',raising=False)
    layouts=Layouts()
    app.dependency_overrides[http.stored_layouts]=lambda:layouts
    app.dependency_overrides[http.durable_ledger]=lambda:None
    try:
        with TestClient(app) as client:
            headers={'Authorization':'Bearer '+TOKEN}
            missing=client.post('/api/v1/label-intake',json={**request(None),'mode':mode},headers=headers)
            assert missing.status_code==422
            for target in ('UNKNOWN','TARGET_C'):
                response=client.post('/api/v1/label-intake',json={**request(target),'mode':mode},headers=headers)
                assert response.status_code==403
                assert response.json()['detail']['code']=='target_not_allowed'
            disabled=p.model_copy(update={'targets':tuple(t.model_copy(update={'enabled':False}) for t in p.targets)})
            monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',disabled.model_copy(update={'revision':'P2'}).model_dump_json())
            response=client.post('/api/v1/label-intake',json={**request('TARGET_A'),'mode':mode},headers=headers)
            assert response.status_code==403
            assert layouts.calls==[]
    finally:app.dependency_overrides.clear()


@pytest.mark.parametrize('letter',list('ABCD'))
def test_simulation_reports_validated_target_and_never_constructs_printer_transport(monkeypatch,prepared,letter):
    targets=tuple(Target(target_id='TARGET_'+c,host='127.0.0.1',port=19100+i,enabled=True) for i,c in enumerate('ABCD'))
    p=policy(targets=targets,sources=(source(allowed_print_target_ids=tuple(t.target_id for t in targets)),))
    monkeypatch.setenv(ENV,TOKEN);monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_dump_json())
    monkeypatch.delattr(app.state,'intake_policy_previous',raising=False)
    database=LedgerDatabase()
    app.dependency_overrides[http.stored_layouts]=lambda:Layouts()
    app.dependency_overrides[http.durable_ledger]=lambda:database.ledger()
    def forbidden_transport(*args):pytest.fail('Simulation must not construct a printer transport')
    app.dependency_overrides[http.intake_transport_factory]=lambda:forbidden_transport
    try:
        with TestClient(app) as client:
            body={**request('TARGET_'+letter),'mode':'simulation'}
            response=client.post('/api/v1/label-intake',json=body,headers={'Authorization':'Bearer '+TOKEN})
            assert response.status_code==200,response.text
            assert response.json()['target_id']=='TARGET_'+letter
            replay=client.post('/api/v1/label-intake',json=body,headers={'Authorization':'Bearer '+TOKEN})
            assert replay.json()['target_id']=='TARGET_'+letter and replay.json()['replayed']
    finally:app.dependency_overrides.clear()
