"""Health must stay small, fail closed, and reflect committed DB heartbeats."""
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
import pytest
from app.intake_queue import health, worker

@pytest.fixture
def health_directory():
    path=Path(__file__).resolve().parents[2]/'.tmp'/('queue-health-'+uuid4().hex)
    path.mkdir(parents=True)
    return path

@pytest.mark.parametrize('change,expected', [({},0),({'monotonic':70},1),({'monotonic':101},1),({'worker_id':'worker-2'},1),({'pid':42},1)])
def test_health_identity_and_monotonic_age(health_directory,monkeypatch,change,expected):
    path=health_directory/'health.json'
    path.write_text(json.dumps(dict(worker_id='worker-1',pid=1,monotonic=99)|change))
    monkeypatch.setattr(health,'HEALTH_FILE',path)
    monkeypatch.setattr(health.time,'monotonic',lambda:100)
    monkeypatch.setenv('TLS_QUEUE_ENABLED','true')
    monkeypatch.setenv('TLS_QUEUE_WORKER_ID','worker-1')
    assert health.main()==expected

def test_no_health_publication_after_database_failure(health_directory,monkeypatch):
    path=health_directory/'health.json'
    monkeypatch.setattr(health,'HEALTH_FILE',path)
    monkeypatch.setattr(worker.sys,'platform','linux')
    monkeypatch.setattr(worker.os,'getpid',lambda:1)
    def failed(*args):
        raise RuntimeError('synthetic database unavailable')
    prepared_SimpleNamespace = SimpleNamespace(heartbeat=failed)
    with pytest.raises(RuntimeError):
        worker.committed_heartbeat(prepared_SimpleNamespace, 'worker-1')
    assert not path.exists()
    worker.committed_heartbeat(SimpleNamespace(heartbeat=lambda *args:None),'worker-1')
    assert json.loads(path.read_text())['worker_id']=='worker-1'

def test_health_missing_or_invalid_file_is_unhealthy(health_directory,monkeypatch):
    path=health_directory/'missing'
    monkeypatch.setattr(health,'HEALTH_FILE',path)
    monkeypatch.setenv('TLS_QUEUE_ENABLED','true')
    assert health.main()==1
    path.write_text('bad json')
    assert health.main()==1
