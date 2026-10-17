from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.label_print.http import router
from app.management.models import Document
from app.label_intake.policy import Policy, Target

def test_catalog_uses_same_management_targets_without_transport(monkeypatch):
    from app.label_print import http
    document = Document(policy=Policy(revision='P1', sources=(), audit=(), targets=(
        Target(target_id='PLANT_1', host='192.0.2.44', port=9100, enabled=True),
        Target(target_id='PLANT_2', host='::1', port=9101, enabled=False),
    )))
    calls = []
    def read(): calls.append('read'); return document
    monkeypatch.setattr(http, 'configured_store', lambda request: SimpleNamespace(read=read))
    app = FastAPI(); app.include_router(router)
    client = TestClient(app, client=('127.0.0.1', 1))
    response = client.get('/label-print/printers')
    assert response.status_code == 200
    assert response.json() == {'policy_origin': 'management', 'printers': [
        dict(target_id='PLANT_1', host='192.0.2.44', port=9100, enabled=True, language='IPL', connection='Ethernet', transport='TCP/RAW'),
        dict(target_id='PLANT_2', host='::1', port=9101, enabled=False, language='IPL', connection='Ethernet', transport='TCP/RAW'),
    ]}
    assert calls == ['read']
    assert client.get('/label-print/printers', headers={'Origin': 'https://other.example'}).status_code == 403
    assert calls == ['read']

def test_unconfigured_catalog_is_empty_not_a_printer_error(monkeypatch):
    from app.label_print import http
    monkeypatch.setattr(http, 'configured_store', lambda request: None)
    from app.management.overview import service
    monkeypatch.setattr(service, 'load_policy', lambda: service.empty_document().policy)
    app = FastAPI(); app.include_router(router)
    response = TestClient(app, client=('127.0.0.1', 1)).get('/label-print/printers')
    assert response.json()['printers'] == []
