"""Named-target CI operations. No arbitrary project, host, shell or SQL input."""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import urllib.error

APP = Path('/opt/thermal-label-studio')
STATE = Path('/var/lib/thermal-label-ci')
CONFIG = Path('/etc/thermal-label-studio')
BACKUPS = Path('/var/backups/thermal-label-studio')
PROJECT = 'thermal-label-studio-lan'
URL = 'http://192.168.254.58:18082'
REPO = 'https://github.com/pikidisini/Thermal-Label-Studio.git'
CONTAINERS = {name: f'{PROJECT}-{name}-1' for name in ('app', 'postgres', 'minio')}


def command(args, *, env=None, timeout=120, data=None):
    result = subprocess.run(list(map(str, args)), input=data, capture_output=True,
                            env=env, timeout=timeout)
    if result.returncode:
        # stderr can contain URLs, configuration and credentials.
        raise RuntimeError('Operation failed; private process output suppressed.')
    return result.stdout


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.new')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    os.replace(temporary, path)


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def inspect(name):
    return json.loads(command(['docker', 'inspect', name]))[0]


def compose(source, *args, image=None):
    environment = dict(os.environ)
    if image:
        environment['TLS_LAN_RELEASE_IMAGE'] = image
    return command(['docker', 'compose', '--project-name', PROJECT, '--env-file',
                    CONFIG / 'pilot.env', '-f', source / 'docker-compose.yml',
                    '-f', source / 'deploy/compose.lan.yml', '-f', CONFIG / 'pilot.yml',
                    *args], env=environment, timeout=180)


def latest_main():
    output = command(['git', 'ls-remote', REPO, 'refs/heads/main']).decode().split()
    if len(output) != 2 or not re.fullmatch('[0-9a-f]{40}', output[0]):
        raise RuntimeError('Main revision unavailable.')
    return output[0]


def schema_hashes(root):
    return {p.name: hashlib.sha256(p.read_text(encoding='utf-8').encode('utf-8')).hexdigest()
            for p in sorted((root / 'backend/schema').glob('*.sql'))}


def validate_model(model):
    if set(model['services']) != {'app', 'postgres', 'minio'}:
        raise ValueError('Unexpected operational services.')
    expected = {'postgres-data': 'thermal-label-studio-lan-postgres',
                'minio-data': 'thermal-label-studio-lan-minio'}
    for key, name in expected.items():
        if model['volumes'][key] != {'external': True, 'name': name}:
            raise ValueError('Operational volume identity changed.')
    app = model['services']['app']
    ports = app.get('ports', [])
    if len(ports) != 1 or ports[0]['host_ip'] != '192.168.254.58' or str(ports[0]['published']) != '18082':
        raise ValueError('Application endpoint changed.')
    if app.get('volumes') or not app.get('read_only'):
        raise ValueError('Unexpected application filesystem access.')
    for key in ('TLS_STORAGE_INITIALIZE', 'TLS_SAP_RFC_ENABLED', 'TLS_QUEUE_ENABLED'):
        if app['environment'].get(key) != 'false':
            raise ValueError('Pilot execution scope changed.')
    for key in ('TLS_PRINTER_HOST', 'TLS_INTAKE_LEDGER_JSON'):
        if app['environment'].get(key, ''):
            raise ValueError('Operational transport activation changed.')


def healthy(*, include_auth=False):
    try:
        for path, expected in (('/health', {'status': 'ok'}), ('/ready', {'status': 'ready'})):
            with urllib.request.urlopen(URL + path, timeout=5) as response:
                if json.load(response) != expected:
                    return False
        if not include_auth:
            return True
        with urllib.request.urlopen(URL + '/api/v1/auth/session', timeout=5) as response:
            session = json.load(response)
            if session.get('user') is not None or not session.get('csrf_token'):
                return False
        try:
            urllib.request.urlopen(URL + '/api/v1/layouts', timeout=5)
            return False
        except urllib.error.HTTPError as error:
            if error.code != 401:
                return False
        return True
    except Exception:
        return False


def wait_healthy():
    for _ in range(30):
        if healthy(include_auth=True):
            return
        time.sleep(2)
    raise RuntimeError('Runtime health failed.')


def retain_release_images():
    """Remove only verified CI-owned tags beyond three successful releases."""
    records = []
    for path in (APP / 'releases').glob('*/release.json'):
        try:
            item = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        sha = item.get('commit', '')
        if item.get('status') == 'DEPLOYED' and re.fullmatch('[0-9a-f]{40}', sha):
            if item.get('image') == 'thermal-label-studio:git-' + sha and isinstance(item.get('timestamp'), str):
                records.append(item)
    records.sort(key=lambda value: value['timestamp'], reverse=True)
    keep = {item['image'] for item in records[:3]}
    latest = records[0] if records else {}
    keep.update(filter(None, (latest.get('image'), latest.get('previous_image'))))
    for item in records:
        if item['image'] in keep:
            continue
        try:
            image = json.loads(command(['docker', 'image', 'inspect', item['image']]))[0]
            labels = image['Config'].get('Labels') or {}
            if labels.get('io.thermal-label.ci.release') == 'true' and labels.get('org.opencontainers.image.revision') == item['commit']:
                command(['docker', 'image', 'rm', item['image']])
        except (RuntimeError, ValueError, KeyError, OSError):
            pass  # Never force-remove an in-use image or fail a healthy release.


def backup(environment):
    # Preserve historical key material, not just current active configuration.
    material = CONFIG / 'recovery/material'
    if not material.is_dir() or not any(material.iterdir()):
        raise RuntimeError('Retained recovery material is missing.')
    env = dict(os.environ)
    env.update(environment)
    env['PYTHONPATH'] = '/app/backend'
    args = ['docker', 'run', '--rm', '--user', '1000:1000', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--memory', '512m', '--pids-limit', '64', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
            '--network', PROJECT + '_default', '--entrypoint', 'python']
    for source, target, read_only in ((BACKUPS, '/backups', False),
                                      (CONFIG, '/configuration', True),
                                      (CONFIG / 'recovery', '/keys', True)):
        args += ['--mount', f'type=bind,source={source},target={target}' + (',readonly' if read_only else '')]
    for key in ['PYTHONPATH'] + [k for k in environment if k.startswith('TLS_')]:
        args += ['-e', key]
    args += ['thermal-label-maintenance:lan-aa5838ce8387', '-B',
             '/app/scripts/production_backup.py', 'create', '--apply', '--quiesced',
             '--backup-key-file', '/keys/backup.key', '--output-root', '/backups',
             '--pg-dump', '/usr/local/bin/pg_dump', '--confirm-host', 'postgres',
             '--confirm-database', 'thermal_label_studio', '--confirm-object-store', 'minio:9000',
             '--confirm-bucket', 'thermal-label-layouts', '--configuration-file', '/configuration/pilot.env',
             '--configuration-file', '/configuration/pilot.yml']
    for path in sorted(material.iterdir()):
        if not path.is_file() or path.is_symlink():
            raise ValueError('Invalid retained recovery material.')
        args += ['--configuration-file', '/configuration/recovery/material/' + path.name]
    report = json.loads(command(args, env=env, timeout=600))
    if report.get('status') != 'PASS':
        raise RuntimeError('Backup verification failed.')
    atomic_json(STATE / 'last-backup.json', {'status': 'PASS', 'timestamp': utc(), 'bundle': Path(report['bundle']).name})
    return report


@contextlib.contextmanager
def deploy_lock():
    import fcntl
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / 'deployment.lock').open('a') as stream:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        yield


def deploy(workspace, sha, image_id):
    if not re.fullmatch('[0-9a-f]{40}', sha) or not re.fullmatch('sha256:[0-9a-f]{64}', image_id):
        raise ValueError('Invalid candidate identity.')
    workspace = workspace.resolve()
    tag = 'thermal-label-studio:git-' + sha
    if command(['git', '-C', workspace, 'rev-parse', 'HEAD']).decode().strip() != sha:
        raise ValueError('Workspace revision changed.')
    command(['git', '-C', workspace, 'diff', '--exit-code', 'HEAD', '--'])
    if json.loads(command(['docker', 'image', 'inspect', tag]))[0]['Id'] != image_id:
        raise ValueError('Candidate image changed.')
    with deploy_lock():
        if not (STATE / 'auto-release.enabled').is_file():
            return {'status': 'QUALIFIED', 'deployment': 'NOT RUN', 'reason': 'cutover_not_enabled'}
        if latest_main() != sha:
            return {'status': 'SKIPPED', 'reason': 'superseded_commit'}
        old_source = (APP / 'current').resolve()
        if schema_hashes(old_source) != schema_hashes(workspace):
            raise ValueError('Schema SQL changed; separate migration required.')
        model = json.loads(compose(workspace, 'config', '--format', 'json', image=tag))
        validate_model(model)
        running = inspect(CONTAINERS['app'])
        old_image = running['Config']['Image']
        environment = dict(value.split('=', 1) for value in running['Config']['Env'])
        destination = APP / 'releases' / sha / 'source'
        if not destination.exists():
            destination.mkdir(parents=True)
            with tempfile.TemporaryFile() as archive:
                archive.write(command(['git', '-C', workspace, 'archive', '--format=tar', sha]))
                archive.seek(0)
                with tarfile.open(fileobj=archive) as source:
                    source.extractall(destination, filter='data')
        original_env = (CONFIG / 'pilot.env').read_bytes()
        old_link = os.readlink(APP / 'current')
        stopped = False
        try:
            atomic_json(STATE / 'last-release.json', {'status': 'DEPLOYING', 'timestamp': utc(), 'commit': sha,
                                                    'previous_source': str(old_source), 'previous_image': old_image})
            compose(old_source, 'stop', 'app', image=old_image)
            stopped = True
            try:
                backup(environment)
            except Exception:
                atomic_json(STATE / 'last-backup.json', {'status': 'FAIL', 'timestamp': utc()})
                raise
            if latest_main() != sha:
                compose(old_source, 'up', '-d', '--no-deps', '--no-build', 'app', image=old_image)
                wait_healthy()
                atomic_json(STATE / 'last-release.json', {'status': 'SKIPPED', 'timestamp': utc(), 'commit': sha,
                                                        'reason': 'superseded_after_backup'})
                return {'status': 'SKIPPED', 'reason': 'superseded_after_backup'}
            compose(destination, 'up', '-d', '--no-deps', '--no-build', 'app', image=tag)
            wait_healthy()
            if inspect(CONTAINERS['app'])['Config']['Image'] != tag:
                raise ValueError('Running container is not the accepted candidate.')
            updated, replacements = re.subn(rb"(?m)^TLS_LAN_RELEASE_IMAGE=.*$", ('TLS_LAN_RELEASE_IMAGE=' + tag).encode(), original_env)
            if replacements != 1:
                raise ValueError('Unexpected private image configuration.')
            pending = CONFIG / 'pilot.env.new'
            pending.write_bytes(updated)
            pending.chmod(0o600)
            os.replace(pending, CONFIG / 'pilot.env')
            link = APP / 'current.new'
            link.symlink_to(destination)
            os.replace(link, APP / 'current')
            report = {'status': 'DEPLOYED', 'timestamp': utc(), 'commit': sha, 'image': tag,
                      'image_id': image_id, 'previous_source': str(old_source), 'previous_image': old_image}
            atomic_json(STATE / 'last-release.json', report)
            atomic_json(APP / 'releases' / sha / 'release.json', report)
            retain_release_images()
            return report
        except Exception:
            if stopped:
                pending = CONFIG / 'pilot.env.new'
                pending.write_bytes(original_env)
                pending.chmod(0o600)
                os.replace(pending, CONFIG / 'pilot.env')
                link = APP / 'current.new'
                if link.is_symlink():
                    link.unlink()
                link.symlink_to(old_link)
                os.replace(link, APP / 'current')
                compose(old_source, 'up', '-d', '--no-deps', '--no-build', 'app', image=old_image)
                wait_healthy()
            atomic_json(STATE / 'last-release.json', {'status': 'FAILED', 'timestamp': utc(), 'commit': sha,
                                                    'rollback': 'PASS' if stopped else 'NOT RUN'})
            raise


def transition(previous, success):
    result = dict(previous or {'state': 'PENDING', 'failures': 0, 'successes': 0})
    result['failures'] = 0 if success else result['failures'] + 1
    result['successes'] = result['successes'] + 1 if success else 0
    if result['failures'] >= 3:
        result['state'] = 'DOWN'
    elif result['successes'] >= 2:
        result['state'] = 'UP'
    return result


STORAGE_CHECK = '''import json
from app.config import get_settings
s=get_settings().persistence
result={}
try:
 import psycopg
 with psycopg.connect(s.database_url,connect_timeout=3,options='-c default_transaction_read_only=on') as c:
  result['database']=c.execute('SELECT 1').fetchone()[0]==1
except Exception: result['database']=False
try:
 from minio import Minio
 import urllib3
 client=Minio(s.minio_endpoint,access_key=s.minio_access_key,secret_key=s.minio_secret_key,secure=s.minio_secure,http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=3,read=3),retries=False))
 result['object_store']=client.bucket_exists(s.minio_bucket)
except Exception: result['object_store']=False
print(json.dumps(result))
'''


def monitor():
    path = STATE / 'monitor/status.json'
    previous = json.loads(path.read_text()) if path.exists() else {}
    checks = {'http': healthy()}
    for name, container in CONTAINERS.items():
        try:
            current = inspect(container)['State']
            checks[name] = current['Running'] and current.get('Health', {}).get('Status', 'healthy') == 'healthy'
        except Exception:
            checks[name] = False
    try:
        checks.update(json.loads(command(['docker', 'exec', CONTAINERS['app'], 'python', '-c', STORAGE_CHECK], timeout=15)))
    except Exception:
        checks.update(database=False, object_store=False)
    services = {key: transition(previous.get('services', {}).get(key), value) for key, value in checks.items()}
    disk = shutil.disk_usage(APP)
    percent = round(100 * disk.used / disk.total, 1)
    memory = {line.split(':')[0]: int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()}
    overall = 'DOWN' if any(s['state'] == 'DOWN' for s in services.values()) or percent >= 90 else 'UP'
    if overall == 'UP' and (percent >= 80 or any(s['state'] == 'PENDING' for s in services.values())):
        overall = 'WARNING'
    bundles = list(BACKUPS.glob('*.tlsbackup'))
    report = {'timestamp': utc(), 'state': overall, 'services': services, 'disk_percent': percent,
              'memory_used_percent': round(100 * (1 - memory['MemAvailable'] / memory['MemTotal']), 1),
              'load_per_cpu': round(os.getloadavg()[0] / (os.cpu_count() or 1), 2),
              'backup_age_seconds': round(time.time() - max(p.stat().st_mtime for p in bundles)) if bundles else None,
              'application_source': (APP / 'current').resolve().parent.name}
    for name in ('last-release', 'last-backup'):
        target = STATE / (name + '.json')
        report[name] = json.loads(target.read_text()) if target.exists() else {'status': 'NOT RUN'}
    atomic_json(path, report)
    path.chmod(0o644)  # Sanitized summary only; directory controls access.
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('monitor', 'deploy'))
    parser.add_argument('--workspace', type=Path)
    parser.add_argument('--commit')
    parser.add_argument('--image-id')
    args = parser.parse_args()
    result = monitor() if args.action == 'monitor' else deploy(args.workspace, args.commit, args.image_id)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'FAIL', 'reason': 'operation_failed_private_details_suppressed'}))
        raise SystemExit(1) from None
