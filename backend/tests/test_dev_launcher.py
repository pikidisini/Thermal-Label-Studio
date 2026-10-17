"""Development startup must not silently inherit storage configuration."""

import importlib.util
from pathlib import Path
from unittest.mock import patch, Mock, call

import pytest

spec = importlib.util.spec_from_file_location(
    "dev_launcher", Path(__file__).resolve().parents[2] / "scripts/dev.py")
dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)


def server_owner():
    return dict(pid=123, name="python.exe", created="123456",
                command=f'python -m uvicorn app.main:app --reload-dir "{dev.ROOT / "backend/app"}" --port 8000')


def test_summary_displays_both_ports_without_prompting(capsys):
    with patch.object(dev, 'wait_for_port', side_effect=[False, True]), \
         patch.object(dev, 'port_owner', return_value=server_owner()), \
         patch('builtins.input') as prompt, patch.object(dev, 'stop_verified_owner') as stop:
        dev.show_port_summary()
        output = capsys.readouterr().out
        assert 'Backend: 8000 - occupied; PID: 123' in output
        assert 'Frontend: 5173 - available' in output
        prompt.assert_not_called()
        stop.assert_not_called()


def test_port_owner_must_match_project_and_server_role():
    assert dev.is_project_server(server_owner())
    owner = server_owner()
    owner['command'] = 'python unrelated.py'
    assert not dev.is_project_server(owner)
    owner['command'] = 'python -m uvicorn app.main:app --reload-dir C:\\other\\backend\\app'
    assert not dev.is_project_server(owner)


@pytest.mark.parametrize('answer', ['', 'n', 'no', 'anything'])
def test_conflict_refusal_never_stops_process(answer):
    with patch.object(dev, 'port_owner', return_value=server_owner()), \
         patch.object(dev.sys.stdin, 'isatty', return_value=True), \
         patch('builtins.input', return_value=answer), \
         patch.object(dev, 'stop_verified_owner') as stop:
        assert not dev.resolve_port_conflict(8000, True)
        stop.assert_not_called()


def test_confirmation_is_required_before_stop():
    owner = server_owner()
    with patch.object(dev, 'port_owner', return_value=owner), \
         patch.object(dev.sys.stdin, 'isatty', return_value=True), \
         patch('builtins.input', return_value='yes'), \
         patch.object(dev, 'stop_verified_owner') as stop:
        assert dev.resolve_port_conflict(8000, True)
        stop.assert_called_once_with(owner)


def test_check_mode_never_prompts_or_stops():
    with patch.object(dev, 'port_owner', return_value=server_owner()), \
         patch('builtins.input') as prompt, patch.object(dev, 'stop_verified_owner') as stop:
        assert not dev.resolve_port_conflict(8000, False)
        prompt.assert_not_called()
        stop.assert_not_called()


def test_unrelated_owner_never_prompts_or_stops():
    owner = dict(pid=321, name='other.exe', command='other.exe', created='123')
    with patch.object(dev, 'port_owner', return_value=owner), \
         patch('builtins.input') as prompt, patch.object(dev, 'stop_verified_owner') as stop:
        assert not dev.resolve_port_conflict(8000, True)
        prompt.assert_not_called()
        stop.assert_not_called()


def test_revalidation_failure_does_not_report_success():
    with patch.object(dev, 'powershell_json', side_effect=ValueError('identity changed')):
        with pytest.raises(ValueError, match='identity changed'):
            dev.stop_verified_owner(server_owner())


def test_restart_waits_for_companion_frontend_shutdown():
    with patch.object(dev, 'show_port_summary'), patch.object(dev.shutil, 'which', return_value='node'), \
         patch.object(dev.Path, 'is_file', return_value=True), \
         patch.object(dev.importlib.util, 'find_spec', return_value=object()), \
         patch.object(dev, 'wait_for_port', side_effect=[False, True, True]) as wait, \
         patch.object(dev, 'resolve_port_conflict', return_value=True) as resolve:
        assert dev.check_prerequisites(True) == 'node'
        assert wait.call_args_list == [
            call(8000, 0), call(8000, 10), call(5173, 10)]
        resolve.assert_called_once_with(8000, True)


def test_disappearing_owner_is_rechecked_without_termination():
    with patch.object(dev, 'show_port_summary'), patch.object(dev.shutil, 'which', return_value='node'), \
         patch.object(dev.Path, 'is_file', return_value=True), \
         patch.object(dev.importlib.util, 'find_spec', return_value=object()), \
         patch.object(dev, 'wait_for_port', side_effect=[False, True, True]), \
         patch.object(dev, 'resolve_port_conflict', return_value=False), \
         patch.object(dev, 'stop_verified_owner') as stop:
        assert dev.check_prerequisites(True) == 'node'
        stop.assert_not_called()


def test_default_environment_removes_storage_without_changing_parent():
    original = {key: "configured" for key in dev.PERSISTENCE_KEYS}
    original.update(TLS_FRONTEND_DIST="old-build", TLS_MINIO_SECURE="true")
    with patch.dict(dev.os.environ, original, clear=True):
        child = dev.prepare_environment(False)
        assert not any(key in child for key in dev.PERSISTENCE_KEYS)
        assert "TLS_FRONTEND_DIST" not in child
        assert "TLS_MINIO_SECURE" not in child
        assert child["TLS_BIND_HOST"] == "127.0.0.1"
        assert dict(dev.os.environ) == original


def test_persistence_requires_complete_nonempty_configuration():
    with patch.dict(dev.os.environ, {"TLS_DATABASE_URL": "configured"}, clear=True):
        with pytest.raises(ValueError, match="all TLS persistence"):
            dev.prepare_environment(True)


def test_explicit_storage_configuration_is_preserved():
    original = {key: "configured" for key in dev.PERSISTENCE_KEYS}
    with patch.dict(dev.os.environ, original, clear=True):
        child = dev.prepare_environment(True)
        assert all(child[key] == value for key, value in original.items())


def compose_config():
    return {"services": {
        "app": {"environment": {
            "TLS_DATABASE_URL": "postgresql://user:encoded%40password@postgres:5432/layouts",
            "TLS_MINIO_ENDPOINT": "minio:9000", "TLS_MINIO_ACCESS_KEY": "test-key",
            "TLS_MINIO_SECRET_KEY": "test-secret", "TLS_MINIO_BUCKET": "layouts"}},
        "postgres": {"ports": [{"host_ip": "127.0.0.1", "target": 5432, "published": "5434"}]},
        "minio": {"ports": [{"host_ip": "127.0.0.1", "target": 9000, "published": "9002"}]},
    }}


def test_compose_translation_preserves_encoded_credentials_and_uses_host_ports():
    result = dev.compose_storage_environment(compose_config())
    assert result["TLS_DATABASE_URL"] == "postgresql://user:encoded%40password@127.0.0.1:5434/layouts"
    assert result["TLS_MINIO_ENDPOINT"] == "127.0.0.1:9002"


def test_compose_translation_rejects_non_loopback_storage():
    config = compose_config()
    config["services"]["postgres"]["ports"][0]["host_ip"] = "0.0.0.0"
    with pytest.raises(ValueError, match="loopback"):
        dev.compose_storage_environment(config)


def test_compose_storage_rejects_competing_application_writer():
    with patch.object(dev.subprocess, 'run', return_value=Mock(
            returncode=0, stdout='app\npostgres\nminio\n')):
        with pytest.raises(ValueError, match='Stop the Compose app'):
            dev.load_compose_storage()


def test_compose_storage_requires_running_storage_services():
    with patch.object(dev.subprocess, 'run', return_value=Mock(
            returncode=0, stdout='postgres\n')):
        with pytest.raises(ValueError, match='must be running'):
            dev.load_compose_storage()


def test_normal_startup_uses_compose_storage():
    args = dev.parse_arguments([])
    assert args.compose_storage and not args.no_storage


def test_storage_can_only_be_disabled_explicitly():
    args = dev.parse_arguments(['--no-storage'])
    assert args.no_storage and not args.compose_storage


def test_explicit_environment_storage_does_not_read_compose():
    args = dev.parse_arguments(['--persistence'])
    assert args.persistence and not args.compose_storage


def test_dev_carries_server_owned_printer_settings_without_connecting():
    config = compose_config()
    config["services"]["app"]["environment"].update(TLS_PRINTER_HOST="192.0.2.44", TLS_PRINTER_PORT="9100")
    translated = dev.compose_storage_environment(config)
    assert translated["TLS_PRINTER_HOST"] == "192.0.2.44"
    with patch.dict(dev.os.environ, {}, clear=True):
        child = dev.prepare_environment(True, translated)
    assert child["TLS_PRINTER_HOST"] == "192.0.2.44" and child["TLS_PRINTER_PORT"] == "9100"
