"""Provisioning stays plan-only and refuses running or mismatched targets."""
import importlib.util
from pathlib import Path
import sys
import pytest

sys.path.insert(0,str(Path(__file__).parents[2]/'scripts'))
import provision_print_safety as provision


def test_plan_cannot_contact_docker_or_database(monkeypatch):
    monkeypatch.setattr(provision,'require_stopped_application',lambda:pytest.fail('Plan inspected server'))
    assert provision.main([])==0


def test_wrong_named_database_stops_before_effects(monkeypatch):
    monkeypatch.setenv('TLS_INTAKE_DATABASE_URL','postgresql://synthetic/ledger')
    monkeypatch.setattr(provision,'require_stopped_application',lambda:pytest.fail('Wrong target inspected server'))
    with pytest.raises(SystemExit):
        provision.main(['--apply','--confirm-host','other','--confirm-database','ledger','--confirm-container','thermal-label-studio-lan-app-1'])


def test_live_app_blocks_provisioning(monkeypatch):
    monkeypatch.setenv('TLS_INTAKE_DATABASE_URL','postgresql://synthetic/ledger')
    def refuse():raise RuntimeError('Application not stopped')
    monkeypatch.setattr(provision,'require_stopped_application',refuse)
    with pytest.raises(RuntimeError):
        provision.main(['--apply','--confirm-host','synthetic','--confirm-database','ledger','--confirm-container','thermal-label-studio-lan-app-1'])
