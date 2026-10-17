"""Graphics admission, persistence contract and HTTP boundaries; no live stores."""
import base64
import io
from types import SimpleNamespace
from uuid import uuid4
import pytest
from PIL import Image
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.graphics.http import router
from app.graphics.service import GraphicsService, GraphicsUnavailable
from app.graphics.validation import validate_graphic, MAX_BODY_BYTES


def graphic(fmt='PNG', size=(8, 4)):
    output = io.BytesIO()
    Image.new('RGB', size, 'black').save(output, format=fmt)
    mime = {'PNG': 'png', 'JPEG': 'jpeg', 'WEBP': 'webp'}[fmt]
    return {'name': 'Mixed Case Logo', 'data_uri': f'data:image/{mime};base64,' + base64.b64encode(output.getvalue()).decode()}


class Database:
    def __init__(self): self.rows = {}; self.sql = []; self.fail = False
    def connect(self, *_args, **_kwargs): return self
    def cursor(self): return self
    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def execute(self, sql, args=None):
        self.sql.append((sql, args))
        if self.fail: raise RuntimeError('secret database credential')
        if 'INSERT INTO' in sql:
            identifier, name, mime, content, width, height, stamp = args
            row = (identifier, name, mime, len(content), width, height, stamp, content)
            self.rows[str(identifier)] = row
            self.result = row[:7]
        elif 'WHERE id=' in sql:
            self.result = self.rows.get(str(args[0]))
        else:
            query, offset = args
            self.result = [row[:7] for row in reversed(list(self.rows.values())) if query.lower() in row[1].lower()][offset:offset + 100]
    def fetchone(self): return self.result
    def fetchall(self): return self.result


@pytest.fixture
def service():
    result = GraphicsService.__new__(GraphicsService)
    result.settings = SimpleNamespace(database_url='fake')
    result._database = Database()
    return result


@pytest.fixture
def client(service):
    app = FastAPI(); app.include_router(router); app.state.graphics_service = service
    with TestClient(app, client=('127.0.0.1', 50000)) as client: yield client


@pytest.mark.parametrize('fmt', ['PNG', 'JPEG', 'WEBP'])
def test_exact_image_bytes_roundtrip_and_static_svg_admission(service, fmt):
    from app.template_binding.validation import admit_template
    value = graphic(fmt)
    summary = service.create(value)
    assert summary['name'] == value['name']
    assert summary['version'] == 1 and 'data_uri' not in summary
    assert service.get(summary['id'])['data_uri'] == value['data_uri']
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 80 40"><image width="8" height="4" href="{value["data_uri"]}"/></svg>'
    admit_template(svg)
    second = service.create(value)
    assert summary['id'] != second['id']
    assert len(service.list(query='case logo')) == 2
    assert service.list(query='missing') == []
    assert service.list(offset=2) == []


@pytest.mark.parametrize('value', [
    {}, {'name': 'Logo', 'data_uri': 'https://example.com/logo.png'},
    {'name': 'Logo', 'data_uri': 'data:image/svg+xml;base64,PHN2Zy8+'},
    {'name': 'Logo', 'data_uri': 'data:image/png;base64,AAAA'},
    {'name': 'Logo', 'data_uri': 'data:image/png;base64,==='},
    {'name': '', 'data_uri': ''}, {'name': 'A' * 161, 'data_uri': ''},
])
def test_invalid_images_do_not_touch_storage(client, service, value):
    assert client.post('/graphics', json=value).status_code == 422
    assert service._database.sql == []


def test_reject_mismatch_dimensions_pixels_and_animation_before_storage(client, service):
    mismatch = graphic(); mismatch['data_uri'] = mismatch['data_uri'].replace('image/png', 'image/jpeg')
    animation = io.BytesIO()
    Image.new('RGB', (2, 2), 'black').save(animation, format='PNG', save_all=True,
        append_images=[Image.new('RGB', (2, 2), 'white')], duration=100)
    animated = {'name': 'Animated', 'data_uri': 'data:image/png;base64,' + base64.b64encode(animation.getvalue()).decode()}
    for value in [mismatch, graphic(size=(4097, 1)), graphic(size=(2001, 2000)), animated]:
        assert client.post('/graphics', json=value).status_code == 422
    assert service._database.sql == []


def test_http_upload_list_search_content_and_missing(client, service):
    value = graphic()
    response = client.post('/graphics', json=value)
    assert response.status_code == 201
    identifier = response.json()['id']
    assert client.get('/graphics?q=case').json()[0]['id'] == identifier
    assert client.get('/graphics?q=%25').json() == []
    assert client.get('/graphics?offset=1').json() == []
    assert client.get('/graphics/' + identifier).json()['data_uri'] == value['data_uri']
    content = client.get('/graphics/' + identifier + '/content')
    assert content.content == base64.b64decode(value['data_uri'].split(',')[1])
    assert content.headers['content-type'] == 'image/png'
    assert content.headers['x-content-type-options'] == 'nosniff'
    assert client.get('/graphics/' + str(uuid4())).status_code == 404
    assert client.get('/graphics/not-a-uuid').status_code == 422
    assert client.get('/graphics?offset=-1').status_code == 422
    assert client.get('/graphics?q=' + 'a' * 161).status_code == 422
    assert client.post('/graphics/' + identifier + '/versions', json=value).status_code == 404


def test_bounds_json_duplicates_unconfigured_and_failures(client, service):
    assert client.post('/graphics', content=b'x' * (MAX_BODY_BYTES + 1), headers={'content-type': 'application/json'}).status_code == 413
    assert client.post('/graphics', content='{}').status_code == 415
    assert client.post('/graphics', content='{"name":"a","name":"b","data_uri":"x"}', headers={'content-type':'application/json'}).status_code == 422
    assert not service._database.sql
    service._database.fail = True
    response = client.get('/graphics')
    assert response.status_code == 503 and 'secret' not in response.text
    with pytest.raises(GraphicsUnavailable, match='^Graphics storage is unavailable.$'): service.list()
    del client.app.state.graphics_service
    assert client.get('/graphics').status_code == 503


def test_loopback_guard_and_cross_site_requests(client, service):
    assert client.post('/graphics', json=graphic(), headers={'origin':'https://example.com'}).status_code == 403
    assert client.get('/graphics', headers={'sec-fetch-site':'cross-site'}).status_code == 403
    app = FastAPI(); app.include_router(router); app.state.graphics_service = service
    with TestClient(app, client=('192.0.2.1', 50000)) as remote:
        assert remote.get('/graphics').status_code == 403
        assert remote.post('/graphics', json=graphic()).status_code == 403
    assert not service._database.sql


def test_provisioning_is_plan_only_by_default(monkeypatch, capsys):
    import runpy
    from pathlib import Path
    module = runpy.run_path(str(Path(__file__).resolve().parents[2] / 'scripts/provision_graphics.py'))
    monkeypatch.setattr('sys.argv', ['provision_graphics.py'])
    monkeypatch.setattr('psycopg.connect', lambda *_a, **_k: pytest.fail('plan connected to storage'))
    assert module['main']() == 0
    assert 'No connection made' in capsys.readouterr().out
    monkeypatch.setattr('sys.argv', ['provision_graphics.py', '--apply', '--confirm-host', 'wrong'])
    monkeypatch.setenv('TLS_DATABASE_URL', 'postgresql://secret:secret@127.0.0.1/studio')
    with pytest.raises(ValueError): module['main']()
