"""Offline backup/configuration and supervision tests, with disposable inputs."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
from uuid import uuid4
import pytest
from app.intake_queue import worker

ROOT=Path(__file__).resolve().parents[2]


def script(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py')
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def directory():
    path=ROOT/'.tmp'/('queue-operations-'+uuid4().hex)
    path.mkdir(parents=True)
    return path


def test_lifecycle_default_never_constructs_a_database(monkeypatch,capsys):
    module=script('queue_operations')
    monkeypatch.setattr(module,'create_queue',lambda:pytest.fail('plan accessed storage'))
    assert module.main(['recover'])==0
    assert json.loads(capsys.readouterr().out)['status']=='PLAN ONLY'


def test_lifecycle_apply_requires_exact_named_target(monkeypatch):
    module=script('queue_operations')
    monkeypatch.setenv('TLS_INTAKE_DATABASE_URL','postgresql://synthetic:synthetic@127.0.0.1:9999/test_only')
    monkeypatch.setattr(module,'create_queue',lambda:pytest.fail('invalid confirmation accessed storage'))
    with pytest.raises(SystemExit):
        module.main(['resume','--apply','--confirm-host','other','--confirm-database','test_only','--note','Test'])
    with pytest.raises(SystemExit):
        module.main(['recover','--apply','--confirm-host','127.0.0.1','--confirm-database','test_only','--note','Test'])


def test_backup_default_has_no_external_or_output_effects(monkeypatch,capsys):
    module=script('production_backup')
    monkeypatch.setattr(module.subprocess,'run',lambda *args,**kwargs:pytest.fail('plan invoked dump'))
    assert module.main(['create'])==0
    assert json.loads(capsys.readouterr().out)['external_operations']=='NOT RUN'


def test_backup_encrypts_and_authenticates_inventory_and_corruption():
    module=script('production_backup'); root=directory()
    data=b'synthetic-private-configuration'
    manifest={'version':1,'files':{'configuration/0000':module.hashlib.sha256(data).hexdigest()}}
    archive=root/'source.tar'
    with tarfile.open(archive,'w') as target:
        for name,raw in [('configuration/0000',data),('manifest.json',json.dumps(manifest).encode())]:
            member=tarfile.TarInfo(name); member.size=len(raw)
            target.addfile(member,io.BytesIO(raw))
    assert module.validate_archive(archive)==manifest
    encrypted=root/'encrypted'; restored=root/'restored.tar'
    module.encrypt(archive,encrypted,b'A'*32)
    assert data not in encrypted.read_bytes()
    module.decrypt(encrypted,restored,b'A'*32)
    assert module.validate_archive(restored)==manifest
    damaged=bytearray(encrypted.read_bytes()); damaged[-1]^=1
    corrupt=root/'corrupt'; corrupt.write_bytes(damaged)
    from cryptography.exceptions import InvalidTag
    with pytest.raises(InvalidTag):
        module.decrypt(corrupt,root/'rejected',b'A'*32)


@pytest.mark.parametrize('name',['../escape','/absolute','folder\\escape'])
def test_restore_rejects_unsafe_archive_paths(name):
    module=script('production_backup'); root=directory(); archive=root/'bad.tar'
    with tarfile.open(archive,'w') as target:
        member=tarfile.TarInfo(name); member.size=1; target.addfile(member,io.BytesIO(b'x'))
    with pytest.raises(ValueError,match='Unsafe'):
        module.validate_archive(archive)


def test_production_input_check_does_not_accept_unpinned_images():
    module=script('check_production_config')
    errors=module.inspect({'TLS_RELEASE_IMAGE':'studio:latest'})
    assert 'TLS_RELEASE_IMAGE' in errors
    assert 'network_configuration' in errors


@pytest.mark.parametrize('value',['max','268435456','0'])
def test_native_budget_cannot_be_silently_increased(monkeypatch,value):
    monkeypatch.setattr(worker.sys,'platform','linux')
    monkeypatch.setattr(worker.Path,'read_text',lambda *_args,**_kwargs:value)
    with pytest.raises(RuntimeError,match='fence'):
        worker.require_memory_fence()


def test_native_budget_uses_aggregate_container_fence(monkeypatch):
    monkeypatch.setattr(worker.sys,'platform','linux')
    monkeypatch.setattr(worker.Path,'read_text',lambda *_args,**_kwargs:'134217728')
    worker.require_memory_fence()


def test_group_kill_and_reap_precedes_ownership_release(monkeypatch):
    calls=[]
    monkeypatch.setattr(worker.signal,'SIGKILL',9,raising=False)
    monkeypatch.setattr(worker.os,'WNOHANG',1,raising=False)
    class Process:
        pid=123456
        def wait(self,timeout): calls.append('wait')
    def kill(group,sig):
        calls.append('kill' if sig else 'verify')
        if not sig:
            raise ProcessLookupError()
    monkeypatch.setattr(worker.os,'killpg',kill,raising=False)
    monkeypatch.setattr(worker.os,'waitpid',lambda *_args:(_ for _ in ()).throw(ChildProcessError()),raising=False)
    worker.kill_and_reap(Process())
    assert calls==['kill','wait','verify']


@pytest.mark.parametrize('trigger',['timeout','stop','completed'])
def test_supervisor_proves_exit_before_recovery_and_finish(monkeypatch,trigger):
    from types import SimpleNamespace
    calls=[]
    process=SimpleNamespace(stdout=SimpleNamespace(close=lambda:None),returncode=0,
                            poll=lambda:0 if trigger=='completed' else None)
    selector=SimpleNamespace(register=lambda *_args:None,select=lambda **_kwargs:[],close=lambda:None)
    clock=iter([0,61])
    monkeypatch.setattr(worker.subprocess,'Popen',lambda *_args,**_kwargs:process)
    monkeypatch.setattr(worker.selectors,'DefaultSelector',lambda:selector)
    monkeypatch.setattr(worker.time,'monotonic',lambda:next(clock))
    monkeypatch.setattr(worker,'kill_and_reap',lambda _process:calls.append('reaped'))
    queue=SimpleNamespace(heartbeat=lambda *_args:None,finish=lambda *_args:calls.append('finished'),
                          ledger=SimpleNamespace(recover_quiesced=lambda *_args:calls.append('recovered')))
    worker.supervise(queue,'synthetic-job','worker-1',stop=lambda:trigger=='stop')
    assert calls==(['reaped','finished'] if trigger=='completed' else ['reaped','recovered','finished'])


def test_unproven_owner_never_recovers_or_releases_its_printer(monkeypatch):
    from types import SimpleNamespace
    process=SimpleNamespace(stdout=SimpleNamespace(close=lambda:None),returncode=0,poll=lambda:0)
    selector=SimpleNamespace(register=lambda *_args:None,close=lambda:None)
    monkeypatch.setattr(worker.subprocess,'Popen',lambda *_args,**_kwargs:process)
    monkeypatch.setattr(worker.selectors,'DefaultSelector',lambda:selector)
    def unproven(_process): raise RuntimeError('synthetic failure to stop owner')
    monkeypatch.setattr(worker,'kill_and_reap',unproven)
    queue=SimpleNamespace(heartbeat=lambda *_args:None,finish=lambda *_args:pytest.fail('released unproven owner'),
                          ledger=SimpleNamespace(recover_quiesced=lambda *_args:pytest.fail('recovered unproven owner')))
    with pytest.raises(worker.OwnerNotStopped):
        worker.supervise(queue,'synthetic-job','worker-1')


def test_restore_default_does_not_import_database_or_write_storage(monkeypatch,capsys):
    monkeypatch.syspath_prepend(str(ROOT/'scripts'))
    module=script('production_restore')
    assert module.main([])==0
    assert json.loads(capsys.readouterr().out)['storage_writes']=='NOT RUN'
