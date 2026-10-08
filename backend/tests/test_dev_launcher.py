"""Development startup must not silently inherit storage configuration."""

import importlib.util
from pathlib import Path
from unittest.mock import patch, Mock

import pytest

spec = importlib.util.spec_from_file_location(
    "dev_launcher", Path(__file__).resolve().parents[2] / "scripts/dev.py")
dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)


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
