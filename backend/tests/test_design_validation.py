from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.simulation.design_http import router
from app.engine.editor_request import EditorBodyMiddleware

SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="70mm" viewBox="0 0 400 280" data-binding-version="1"><rect width="20" height="20" fill="black"/></svg>'


def test_design_admission_without_storage_or_renderer():
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.add_middleware(EditorBodyMiddleware)
    client = TestClient(app)
    draft = dict(svg=SVG, width_mm=100, height_mm=70, dpi=203, binding_version=1)
    result = client.post('/api/v1/design/validate', json=draft)
    assert result.status_code == 200
    assert result.json()['required_keys'] == []
    assert len(result.json()['template_sha256']) == 64
    for bad in [SVG.replace('<rect', '<script/><rect'), SVG.replace('400 280', '401 280')]:
        assert client.post('/api/v1/design/validate', json={**draft, 'svg': bad}).status_code == 422
    assert client.post('/api/v1/design/validate', json={**draft, 'width_mm': 101}).status_code == 422
    assert client.post('/api/v1/design/validate', content='{"svg":1,"svg":2}',
                       headers={'content-type': 'application/json'}).status_code == 400
