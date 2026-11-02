"""Recovery command never stops/restarts services and checks identity first."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import pytest

spec=importlib.util.spec_from_file_location('recover_direct_print',Path(__file__).parents[2]/'scripts/recover_direct_print.py')
recovery=importlib.util.module_from_spec(spec);spec.loader.exec_module(recovery)


def test_plan_has_no_effects(monkeypatch):
    monkeypatch.setattr(recovery.subprocess,'run',lambda *a,**k:pytest.fail('Plan invoked Docker'))
    assert recovery.main([])==0


@pytest.mark.parametrize('running,other',[ (b'true',b''),(b'false',b'another-app'),(b'unknown',b'')])
def test_live_or_unidentified_owner_cannot_be_recovered(monkeypatch,running,other):
    monkeypatch.setenv('TLS_INTAKE_DATABASE_URL','postgresql://synthetic/ledger')
    calls=[]
    def run(args,**kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=0,stdout=running if args[1]=='inspect' else other)
    monkeypatch.setattr(recovery.subprocess,'run',run)
    with pytest.raises(RuntimeError,match='not proven stopped'):
        recovery.main(['--apply','--job-id','11111111-1111-4111-8111-111111111111',
            '--confirm-host','synthetic','--confirm-database','ledger','--confirm-container',recovery.APP,
            '--actor','maintainer','--note','Verified device'])
    assert len(calls)==2
    assert not any('stop' in arg or 'restart' in arg for call in calls for arg in call)
