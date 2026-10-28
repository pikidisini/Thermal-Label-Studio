"""CI host policy tests use temporary directories and fake process boundaries."""
import contextlib
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
from io import BytesIO

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import ci_host as ci


def model():
    return {'services': {'app': {'ports': [{'host_ip': '192.168.254.58', 'published': '18082'}],
                                'read_only': True, 'environment': {
                                    'TLS_STORAGE_INITIALIZE': 'false', 'TLS_SAP_RFC_ENABLED': 'false',
                                    'TLS_QUEUE_ENABLED': 'false'}}, 'postgres': {}, 'minio': {}},
            'volumes': {'postgres-data': {'external': True, 'name': 'thermal-label-studio-lan-postgres'},
                        'minio-data': {'external': True, 'name': 'thermal-label-studio-lan-minio'}}}


def test_health_debounce_requires_three_failures_and_two_recovery_samples():
    state = None
    for success in (True, True):
        state = ci.transition(state, success)
    assert state['state'] == 'UP'
    for _ in range(2):
        state = ci.transition(state, False)
        assert state['state'] == 'UP'
    state = ci.transition(state, False)
    assert state['state'] == 'DOWN'
    state = ci.transition(state, True)
    assert state['state'] == 'DOWN'
    state = ci.transition(state, True)
    assert state['state'] == 'UP'


def test_monitor_health_does_not_create_an_authentication_session(monkeypatch):
    calls = []
    def open_url(url, **kwargs):
        calls.append(url)
        assert url.endswith(('/health', '/ready'))
        return BytesIO(json.dumps({'status': 'ok' if url.endswith('/health') else 'ready'}).encode())
    monkeypatch.setattr(ci.urllib.request, 'urlopen', open_url)
    assert ci.healthy()
    assert len(calls) == 2


@pytest.mark.parametrize('change', ['volume', 'service', 'port', 'mount', 'sap', 'ddl', 'queue'])
def test_operational_identity_and_scope_changes_are_rejected(change):
    candidate = model()
    app = candidate['services']['app']
    if change == 'volume': candidate['volumes']['postgres-data']['name'] = 'unrelated-storage'
    if change == 'service': candidate['services']['worker'] = {}
    if change == 'port': app['ports'][0]['host_ip'] = '0.0.0.0'
    if change == 'mount': app['volumes'] = ['/var/run/docker.sock:/var/run/docker.sock']
    if change == 'sap': app['environment']['TLS_SAP_RFC_ENABLED'] = 'true'
    if change == 'ddl': app['environment']['TLS_STORAGE_INITIALIZE'] = 'true'
    if change == 'queue': app['environment']['TLS_QUEUE_ENABLED'] = 'true'
    with pytest.raises(ValueError): ci.validate_model(candidate)


def test_exact_pilot_model_is_admitted():
    ci.validate_model(model())


def test_process_failures_never_disclose_captured_private_output(monkeypatch):
    class Result:
        returncode = 1
        stdout = b'private source data'
        stderr = b'password=PRIVATE'
    monkeypatch.setattr(ci.subprocess, 'run', lambda *a, **k: Result())
    with pytest.raises(RuntimeError) as error:
        ci.command(['synthetic'])
    assert 'PRIVATE' not in str(error.value)


@pytest.fixture
def temporary_root():
    parent = Path(__file__).resolve().parents[2] / '.tmp'
    parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ci-host-test-', dir=parent) as directory:
        yield Path(directory)


@pytest.fixture
def target(temporary_root, monkeypatch):
    if os.name != 'posix':
        pytest.skip('Linux deployment symlink/rollback contract; exercised by the Linux runner.')
    tmp_path = temporary_root
    app = tmp_path / 'app'
    old = app / 'releases/old/source'
    workspace = tmp_path / 'workspace'
    destination = app / ('releases/' + 'a' * 40) / 'source'
    for path in (old, workspace, destination):
        (path / 'backend/schema').mkdir(parents=True)
        (path / 'backend/schema/001.sql').write_text('CREATE TABLE synthetic(id int);')
    (app / 'current').symlink_to(old, target_is_directory=True)
    config = tmp_path / 'config'
    config.mkdir()
    (config / 'pilot.env').write_text("TLS_LAN_RELEASE_IMAGE='old-image'\n")
    state = tmp_path / 'state'
    state.mkdir()
    monkeypatch.setattr(ci, 'APP', app)
    monkeypatch.setattr(ci, 'CONFIG', config)
    monkeypatch.setattr(ci, 'STATE', state)
    monkeypatch.setattr(ci, 'deploy_lock', contextlib.nullcontext)
    monkeypatch.setattr(ci, 'latest_main', lambda: 'a' * 40)
    monkeypatch.setattr(ci, 'inspect', lambda name: {'Config': {'Image': 'old-image', 'Env': ['TLS_TEST=synthetic']}})
    def command(args, **kwargs):
        return json.dumps([{'Id': 'sha256:' + 'b' * 64}]).encode() if args[:3] == ['docker', 'image', 'inspect'] else ('a' * 40).encode()
    monkeypatch.setattr(ci, 'command', command)
    return app, old, workspace, config, state


def test_sql_transport_line_endings_do_not_invent_a_migration(temporary_root):
    first, second = temporary_root/'windows', temporary_root/'linux'
    for root in (first, second): (root/'backend/schema').mkdir(parents=True)
    (first/'backend/schema/001.sql').write_bytes(b'CREATE TABLE example(id int);\r\n')
    (second/'backend/schema/001.sql').write_bytes(b'CREATE TABLE example(id int);\n')
    assert ci.schema_hashes(first) == ci.schema_hashes(second)
    (second/'backend/schema/001.sql').write_bytes(b'CREATE TABLE example(id bigint);\n')
    assert ci.schema_hashes(first) != ci.schema_hashes(second)


def test_superseded_commit_cannot_stop_or_update_application(target, monkeypatch):
    _, _, workspace, _, state = target
    (state / 'auto-release.enabled').touch()
    monkeypatch.setattr(ci, 'latest_main', lambda: 'c' * 40)
    monkeypatch.setattr(ci, 'compose', lambda *a, **k: pytest.fail('Superseded commit touched runtime'))
    assert ci.deploy(workspace, 'a' * 40, 'sha256:' + 'b' * 64)['status'] == 'SKIPPED'


def test_schema_change_blocks_before_stopping_or_backing_up_application(target, monkeypatch):
    _, _, workspace, _, state = target
    (state / 'auto-release.enabled').touch()
    (workspace / 'backend/schema/002.sql').write_text('ALTER TABLE synthetic ADD COLUMN other int;')
    monkeypatch.setattr(ci, 'compose', lambda *a, **k: pytest.fail('Schema change touched runtime'))
    with pytest.raises(ValueError, match='migration'):
        ci.deploy(workspace, 'a' * 40, 'sha256:' + 'b' * 64)


def test_failed_candidate_restores_image_configuration_and_link(target, monkeypatch):
    app, old, workspace, config, state = target
    (state / 'auto-release.enabled').touch()
    original = (config / 'pilot.env').read_bytes()
    calls = []
    def compose(source, *args, **kwargs):
        calls.append((source, args, kwargs.get('image')))
        return json.dumps(model()).encode() if args[0] == 'config' else b''
    monkeypatch.setattr(ci, 'compose', compose)
    monkeypatch.setattr(ci, 'backup', lambda env: {'status': 'PASS'})
    health_calls = []
    def health():
        health_calls.append(True)
        if len(health_calls) == 1: raise RuntimeError('Synthetic candidate unhealthy')
    monkeypatch.setattr(ci, 'wait_healthy', health)
    with pytest.raises(RuntimeError):
        ci.deploy(workspace, 'a' * 40, 'sha256:' + 'b' * 64)
    assert (app / 'current').resolve() == old
    assert (config / 'pilot.env').read_bytes() == original
    assert calls[-1][0] == old and calls[-1][2] == 'old-image'
    report = json.loads((state / 'last-release.json').read_text())
    assert report['status'] == 'FAILED' and report['rollback'] == 'PASS'
