"""Actual intake orchestration with synthetic policy, transactional fake and recorder."""
from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
import hashlib
from io import BytesIO
from threading import Barrier
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app.main import app
from app.label_intake import http, print_service
from app.label_intake.results import IntakeRequest, IntakeAdmissionError
from app.label_intake.policy import Policy, authenticate
from app.printing.service import PrintBeforeSendError
from app.engine.pipeline import prepare_bitmap, prepare_draft_output
from app.engine.bitmap import RenderedLabel
from app.engine.editor_request import EditorOutputRequest
from app.template_binding.composition import BindingError
from app.simulation.service import simulate_prepared_output
from tests.intake_ledger_fake import LedgerDatabase
from tests.test_label_intake import Layouts, envelope, stored, ROOT
from tests.test_intake_policy import TOKEN, ENV, source, policy, event


class Recorder:
    def __init__(self,database, failure=None):
        self.database=database;self.failure=failure;self.constructed=[];self.calls=[];self.after=None
    def factory(self,target):
        states=[row[0] for row in self.database.rows('SELECT state FROM items ORDER BY item_index')]
        index=len(self.constructed)
        assert states[index]=='SEND_CLAIMED'
        assert all(state=='PREPARED' for state in states[index+1:])
        self.constructed.append(target)
        owner=self
        class Sink:
            def submit(self,payload):
                owner.calls.append(payload)
                if owner.failure and index==1:raise owner.failure
                if owner.after:owner.after(index)
        return Sink()


@pytest.fixture
def setup(monkeypatch):
    database=LedgerDatabase();ledger=database.ledger();layouts=Layouts()
    audit=tuple(event(event_id='E'+code,label_code=code,version=layout.version,
                      svg_sha256=layout.svg_sha256) for code,layout in layouts.values.items())
    p=policy(audit=audit,sources=(source(label_codes=('A','B','UNKNOWN')),))
    monkeypatch.setenv(ENV,TOKEN)
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_dump_json())
    previous=getattr(app.state,'intake_policy_previous',None)
    if hasattr(app.state,'intake_policy_previous'):del app.state.intake_policy_previous
    recorder=Recorder(database)
    app.dependency_overrides[http.stored_layouts]=lambda:layouts
    app.dependency_overrides[http.durable_ledger]=lambda:ledger
    app.dependency_overrides[http.intake_transport_factory]=lambda:recorder.factory
    yield database,ledger,layouts,recorder,p
    for dependency in (http.stored_layouts,http.durable_ledger,http.intake_transport_factory):
        app.dependency_overrides.pop(dependency,None)
    if hasattr(app.state,'intake_policy_previous'):del app.state.intake_policy_previous
    if previous is not None:app.state.intake_policy_previous=previous


@pytest.fixture
def prepare(monkeypatch):
    png=BytesIO();Image.new('1',(320,240),1).save(png,format='PNG',dpi=(203,203))
    calls=[]
    def run(request):
        calls.append(request)
        if request.data.get('FAIL'):raise BindingError('missing_binding')
        return None,prepare_bitmap(RenderedLabel('editor','current',320,240,203,png.getvalue()),copies=request.copies)
    monkeypatch.setattr(print_service,'prepare_draft_output',run)
    return calls


def body(codes=('A','B','A'),copies=1):
    value=envelope(codes,copies);value['mode']='print';return value


def post(value=None):
    return TestClient(app).post('/api/v1/label-intake',json=value or body(),headers={'Authorization':'Bearer '+TOKEN})


def test_http_print_without_any_approval_uses_source_route_and_replays_without_resend(setup, prepare, monkeypatch):
    _, _, _, recorder, p = setup
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON', p.model_copy(update={'audit': (),
        'sources': (source(label_codes=(), simulation_all_label_codes=False),)}).model_dump_json())
    response = post()
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['summary']['submitted'] == 3
    assert all(item['target_id'] == 'PRINTER_DEMO' for item in result['results'])
    assert len(recorder.calls) == len(prepare) == 3
    replay = post().json()
    assert replay['replayed'] and replay['results'] == result['results']
    assert len(recorder.calls) == len(prepare) == 3


@pytest.mark.parametrize('copies',[1,999])
def test_native_copies_one_payload_each_replay_no_storage_or_render(setup,prepare,copies):
    database,ledger,layouts,recorder,p=setup
    value=body(copies=copies);response=post(value)
    assert response.status_code==200,response.text
    result=response.json();assert result['status']=='COMPLETED'
    assert result['summary']==dict(total=3,simulated=0,submitted=3,failed=0,uncertain=0,skipped=0)
    assert [i['template']['version'] for i in result['results']]==[1,7,1]
    assert all(i['confirmed'] is False and i['target_id']=='PRINTER_DEMO' and i['error'] is None for i in result['results'])
    assert len(prepare)==len(recorder.calls)==len(recorder.constructed)==3
    assert all(b'<RS>'+str(copies).encode() in payload for payload in recorder.calls)
    assert layouts.calls==['A','B']
    layouts.values.clear()
    replay=post(value);assert replay.status_code==200 and replay.json()['replayed']
    assert replay.json()['results']==result['results'] and len(recorder.calls)==3 and len(prepare)==3
    assert result['original_trace_id']==replay.json()['original_trace_id']!=replay.json()['trace_id']
    changed=body(copies=copies);changed['items'][0]['data']={'FLAG':True}
    assert post(changed).status_code==409 and len(recorder.calls)==3
    saved=str(database.rows('SELECT metadata FROM requests'))+str(database.rows('SELECT metadata FROM items'))
    assert TOKEN not in saved and 'bitmap_png' not in saved and 'png_base64' not in saved


@pytest.mark.parametrize('problem',['unknown','route_missing','target','binding','copies','deadline','payload','pixels','memory'])
def test_whole_batch_failure_never_constructs_transport(setup,prepare,monkeypatch,problem):
    database,ledger,layouts,recorder,p=setup;value=body()
    if problem=='unknown':value=body(('A','UNKNOWN','B'))
    elif problem=='route_missing':
        monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_copy(update={'sources':(source(label_codes=('A','B','UNKNOWN'),print_target_id=None),)}).model_dump_json())
    elif problem=='target':
        monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_copy(update={'targets':()}).model_dump_json())
    elif problem=='binding':value['items'][1]['data']={'FAIL':True}
    elif problem=='copies':value=body(('A',)*11,999)
    elif problem=='deadline':monkeypatch.setattr(print_service,'DEADLINE_SECONDS',0)
    elif problem=='pixels':monkeypatch.setattr(print_service,'MAX_PIXELS',1)
    elif problem=='memory':monkeypatch.setattr(print_service,'MAX_WORKING',1)
    else:monkeypatch.setattr(print_service,'MAX_IPL',1)
    response=post(value);assert response.status_code==200,response.text
    result=response.json();assert result['status']=='FAILED' and result['summary']['failed']>=1
    assert result['summary']['submitted']==0 and len(result['results'])==len(value['items'])
    assert all(i['status'] in ('FAILED','SKIPPED') and i['error'] for i in result['results'])
    assert recorder.calls==recorder.constructed==[]
    if problem not in ('binding','payload'):assert prepare==[]
    repeated=post(value);assert repeated.json()['replayed'] and repeated.json()['results']==result['results']


@pytest.mark.parametrize('failure,expected',[(OSError('synthetic partial write'),'UNCERTAIN'),
                                           (PrintBeforeSendError('synthetic pre-send proof'),'PARTIAL')])
def test_first_submitted_second_failure_third_skipped(setup,prepare,failure,expected):
    database,ledger,layouts,recorder,p=setup;recorder.failure=failure
    response=post();assert response.status_code==200,response.text
    value=response.json();assert value['status']==expected
    states=['SUBMITTED','UNCERTAIN' if expected=='UNCERTAIN' else 'FAILED','SKIPPED']
    assert [item['status'] for item in value['results']]==states
    assert len(prepare)==3 and len(recorder.calls)==len(recorder.constructed)==2
    assert value['results'][0]['confirmed'] is False
    assert value['results'][1]['error']['code']==('submission_uncertain' if expected=='UNCERTAIN' else 'transport_failed_before_send')
    assert post().json()['results']==value['results'] and len(recorder.calls)==2


def test_factory_failure_is_proven_no_submit(setup,prepare):
    database,ledger,layouts,recorder,p=setup
    def factory(target):raise OSError('synthetic constructor failure')
    app.dependency_overrides[http.intake_transport_factory]=lambda:factory
    response=post();assert response.status_code==200
    assert [i['status'] for i in response.json()['results']]==['FAILED','SKIPPED','SKIPPED']
    assert response.json()['results'][0]['error']['code']=='transport_failed_before_send'
    assert recorder.calls==[]


@pytest.mark.parametrize('change',['revision','route','target','credential','source'])
def test_policy_revoked_during_batch_stops_later_claims(setup,prepare,monkeypatch,change):
    database,ledger,layouts,recorder,p=setup
    def update(index):
        if index!=0:return
        updates={'revision':'P2'}
        if change=='route':updates['sources']=(source(label_codes=('A','B','UNKNOWN'),print_target_id=None),)
        elif change=='target':updates['targets']=()
        elif change=='source':updates['sources']=(source(enabled=False,label_codes=('A','B','UNKNOWN')),)
        elif change=='credential':monkeypatch.setenv(ENV,'rotated_synthetic_unit_test_token_0002')
        monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_copy(update=updates).model_dump_json())
    recorder.after=update
    response=post();assert response.status_code==200,response.text
    assert [i['status'] for i in response.json()['results']]==['SUBMITTED','FAILED','SKIPPED']
    assert response.json()['results'][1]['error']['stage']=='POLICY'
    assert len(recorder.calls)==len(recorder.constructed)==1


@pytest.mark.parametrize('operation',['admit','prepared','claim_send','settle_send','complete_print'])
@pytest.mark.parametrize('fault',['before','after'])
def test_commit_ambiguity_stops_all_later_effects_and_replay_cannot_resend(setup,prepare,operation,fault):
    database,ledger,layouts,recorder,p=setup
    original=getattr(ledger,operation);fired=[]
    def broken(*args,**kwargs):
        if not fired:database.commit_fault=fault;fired.append(True)
        return original(*args,**kwargs)
    setattr(ledger,operation,broken)
    response=post();assert response.status_code==503,response.text
    expected='response_unavailable' if operation in ('claim_send','settle_send','complete_print') else 'ledger_unavailable'
    assert response.json()['detail']['code']==expected
    count=len(recorder.calls)
    assert count== (3 if operation=='complete_print' else 1 if operation=='settle_send' else 0)
    repeated=post()
    # A rejected admission commit created no identity; a repeated request may
    # freshly process only in that proven pre-send case.
    if operation=='admit' and fault=='before':
        assert repeated.status_code==200 and len(recorder.calls)==3
        return
    assert len(recorder.calls)==count
    assert repeated.status_code in (200,409)
    rows=database.rows('SELECT ledger_id,state FROM requests')
    if rows and rows[0][1]=='RECEIVED':
        ledger.recover_quiesced(rows[0][0])  # Synthetic owner is now stopped, no auto resume.
        recovered=post();assert recovered.status_code==200 and recovered.json()['replayed']
        assert len(recorder.calls)==count
        if operation=='claim_send' and fault=='after' or operation in ('settle_send','complete_print'):
            assert recovered.json()['status']=='UNCERTAIN'


def test_crash_after_claim_before_transport_requires_explicit_recovery(setup,prepare):
    database,ledger,layouts,recorder,p=setup
    class Crash(BaseException):pass
    def crash(target):raise Crash()
    request=IntakeRequest.model_validate(body());admission=authenticate(p,'Bearer '+TOKEN,{ENV:TOKEN})
    with pytest.raises(Crash):print_service.print_durable(request,admission,layouts,ledger,str(uuid4()),crash,lambda:p)
    assert database.rows('SELECT state FROM items ORDER BY item_index')==[('SEND_CLAIMED',),('PREPARED',),('PREPARED',)]
    assert post().status_code==409 and recorder.calls==[]
    ledger.recover_quiesced(database.rows('SELECT ledger_id FROM requests')[0][0])
    result=post().json();assert [i['status'] for i in result['results']]==['UNCERTAIN','SKIPPED','SKIPPED']
    assert recorder.calls==[]


def test_competing_workers_only_one_prepares_and_submits(setup,prepare):
    database,ledger,layouts,recorder,p=setup;barrier=Barrier(2)
    class ConcurrentLayouts:
        def get_layout(self,code):barrier.wait(timeout=5);return layouts.values[code]
    request=IntakeRequest.model_validate(body(('A',)));admission=authenticate(p,'Bearer '+TOKEN,{ENV:TOKEN})
    def run():
        try:return print_service.print_durable(request,admission,ConcurrentLayouts(),ledger,str(uuid4()),recorder.factory,lambda:p)
        except IntakeAdmissionError as exc:return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(run) for _ in range(2)];results=[f.result(timeout=10) for f in futures]
    assert len(prepare)==len(recorder.calls)==len(recorder.constructed)==1
    assert any(not isinstance(r,str) and r.status=='COMPLETED' for r in results)
    assert all(not isinstance(r,str) or r=='request_in_progress' for r in results)


@pytest.mark.parametrize('copies',[1,999])
@pytest.mark.parametrize('kind',['static','text','code128'])
def test_native_studio_stored_print_payload_and_decoded_pixels_identical(setup,monkeypatch,copies,kind):
    database,ledger,layouts,recorder,p=setup
    svg=layouts.values['A'].svg;data={};width,height=40,30
    if kind!='static':
        import json
        name='text_binding_fabric.json' if kind=='text' else 'symbol_binding_fabric.json'
        case=json.loads((ROOT/'tests/contracts/templates'/name).read_text(encoding='utf-8'))['cases'][0]
        svg,data,width,height=case['before'],case['data'],80,60
    layout=stored(svg=svg,width=width,height=height);layouts.values={'A':layout}
    p=policy(sources=(source(label_codes=('A',)),),audit=(event(svg_sha256=layout.svg_sha256),))
    monkeypatch.setenv('TLS_INTAKE_POLICY_JSON',p.model_dump_json())
    monkeypatch.setenv('TLS_RENDERER_PATH',str(ROOT/'engine/bin/resvg.exe'))
    monkeypatch.setenv('TLS_FIXTURE_FONT_PATH','C:/Windows/Fonts/arial.ttf')
    request=EditorOutputRequest(draft=dict(svg=svg,width_mm=layout.width_mm,height_mm=layout.height_mm,
        dpi=layout.dpi,binding_version=1),data=data,encoder='IPL',copies=copies)
    _,expected=prepare_draft_output(request)
    value=body(('A',),copies);value['items'][0]['data']=data
    result=post(value);assert result.status_code==200 and result.json()['status']=='COMPLETED',result.text
    assert recorder.calls==[expected.payload]
    import base64
    preview=TestClient(app).post('/api/v1/simulation/editor-preview',json=request.model_dump())
    assert preview.status_code==200
    with Image.open(BytesIO(base64.b64decode(preview.json()['png_base64']))) as shown,Image.open(BytesIO(expected.bitmap.bitmap_png)) as rendered:
        assert shown.tobytes()==rendered.tobytes()
    with Image.open(BytesIO(expected.bitmap.bitmap_png)) as a,Image.open(BytesIO(simulate_prepared_output(expected).bitmap_png)) as b:
        assert a.tobytes()==b.tobytes()


def test_simulation_route_never_constructs_transport(setup,monkeypatch):
    app.dependency_overrides[http.intake_transport_factory]=lambda:lambda target:pytest.fail('simulation transport')
    value=envelope(('A',))
    monkeypatch.setenv('TLS_RENDERER_PATH',str(ROOT/'engine/bin/resvg.exe'))
    assert post(value).status_code==200


def test_openapi_exposes_simulation_and_print_outcome_union():
    schema=app.openapi();response=schema['paths']['/api/v1/label-intake']['post']['responses']['200']['content']['application/json']['schema']
    assert {member['$ref'].rsplit('/',1)[1] for member in response['anyOf']}=={'IntakeResponse','PrintOutcome'}


def test_lost_response_after_terminal_commit_cannot_repeat_submission(setup,prepare,monkeypatch):
    database,ledger,layouts,recorder,p=setup
    real=http.JSONResponse;failures=[]
    def serialize(*args,**kwargs):
        if kwargs.get('content',{}).get('mode')=='print' and not failures:
            failures.append(True);raise RuntimeError('synthetic response failure')
        return real(*args,**kwargs)
    monkeypatch.setattr(http,'JSONResponse',serialize)
    response=post();assert response.status_code==503 and response.json()['detail']['code']=='response_unavailable'
    assert len(recorder.calls)==3
    repeated=post();assert repeated.status_code==200 and repeated.json()['replayed']
    assert repeated.json()['status']=='COMPLETED' and len(recorder.calls)==3


@pytest.mark.parametrize('fault',['before','after'])
def test_proven_no_send_settlement_commit_failure_remains_conservative(setup,prepare,fault):
    database,ledger,layouts,recorder,p=setup
    recorder.failure=PrintBeforeSendError('synthetic pre-send proof')
    real=ledger.settle_not_sent
    def broken(*args):database.commit_fault=fault;return real(*args)
    ledger.settle_not_sent=broken
    response=post();assert response.status_code==503 and response.json()['detail']['code']=='response_unavailable'
    assert len(recorder.calls)==2 and len(recorder.constructed)==2
    assert post().status_code==409 and len(recorder.calls)==2
    ledger.recover_quiesced(database.rows('SELECT ledger_id FROM requests')[0][0])
    recovered=post();assert recovered.status_code==200 and recovered.json()['status']=='UNCERTAIN'
    assert len(recorder.calls)==2
