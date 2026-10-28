"""Exact-image acceptance using disposable, internally networked CI storage."""
import json
import contextlib
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
from uuid import uuid4

LABEL = 'io.thermal-label.ci.fixture'
_SECRETS = set()


def sanitized(value):
    text = value.decode('utf-8', errors='replace') if isinstance(value, bytes) else str(value)
    for secret in _SECRETS:
        text = text.replace(secret, '[REDACTED]')
    return text[-2500:]


def run(args, *, data=None, environment=None, timeout=120):
    result = subprocess.run(args, input=data, capture_output=True, env=environment, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Candidate operation failed: ' + sanitized(result.stderr))
    return result.stdout


CLIENT = r'''
import json,sys,urllib.request,urllib.error,http.cookiejar
value=json.load(sys.stdin)
from app.label_print.fixtures import TEMPLATE
BASE='http://127.0.0.1:8000'
class Client:
 def __init__(self):
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
  self.csrf=None
 def call(self,path,body=None,expected=200):
  headers={'Origin':BASE}
  if self.csrf: headers['X-CSRF-Token']=self.csrf
  raw=None if body is None else json.dumps(body).encode()
  if raw is not None: headers['Content-Type']='application/json'
  request=urllib.request.Request(BASE+'/api/v1'+path,data=raw,headers=headers)
  try:
   with self.opener.open(request,timeout=20) as response: status=response.status; result=json.load(response)
  except urllib.error.HTTPError as error:
   status=error.code; result={}
  if status!=expected: raise ValueError('HTTP acceptance status mismatch: '+path+' expected '+str(expected)+' got '+str(status))
  if 'csrf_token' in result: self.csrf=result['csrf_token']
  return result
 def login(self,name,password,change=None):
  self.call('/auth/session')
  self.call('/auth/login',{'username':name,'password':password})
  if change: self.call('/auth/change-password',{'current_password':password,'password':change})

if value['phase']=='prepare':
 from app.auth.service import AuthService
 from app.auth.store import AuthStore
 import os
 AuthService(AuthStore(os.environ['TLS_DATABASE_URL'])).create_user('ci-admin','CI Admin','Admin',value['temporary'],actor='OFFLINE_BOOTSTRAP',bootstrap=True)
 admin=Client(); admin.login('ci-admin',value['temporary'],value['password'])
 for role in ['Designer','Operator']:
  admin.call('/management/users',{'username':'ci-'+role.lower(),'display_name':'CI '+role,'role':role,'password':value['temporary']},201)
  user=Client(); user.login('ci-'+role.lower(),value['temporary'],value['password'])
  user.call('/management/users',expected=403)
  if role=='Operator':
   user.call('/layouts',{'label_code':'DENIED','title':'Denied','svg':TEMPLATE,'width_mm':80.0,'height_mm':60.0,'dpi':203.2},403)
  else:
   saved=user.call('/layouts',{'label_code':'CI_TEMPLATE','title':'CI synthetic','svg':TEMPLATE,'width_mm':80.0,'height_mm':60.0,'dpi':203.2},201)
   assert saved['version']==1
 payload={'sender':{'system':'CI'},'request_id':'ci-candidate','mode':'simulation','items':[{'item_id':'0010245801','label_code':'CI_TEMPLATE','copies':1,'data':{'BATCH':'0010245801','MATERIAL':'SYNTHETIC'}}]}
 dataset=admin.call('/studio-sample-datasets',{'name':'CI synthetic','original_filename':'ci.json','payload':payload},201)
 dataset_id=str(dataset['id'])
else:
 admin=Client(); admin.login('ci-admin',value['password'])
 dataset_id=value['dataset_id']
 assert admin.call('/layouts/CI_TEMPLATE')['version']==1
 assert admin.call('/studio-sample-datasets/'+dataset_id)['name']=='CI synthetic'
preview=admin.call('/label-print/preview',{'source':'dataset','dataset_id':dataset_id,'encoder':'IPL','batches':['0010245801']})
assert preview['items'][0]['status']=='PREVIEWED'
assert preview['items'][0]['png_base64']
admin.call('/auth/logout',{})
admin.call('/layouts',expected=401)
print(json.dumps({'status':'PASS','dataset_id':dataset_id,'phase':value['phase'],'login_roles_save_preview_logout':'PASS','printer':'NOT RUN','SAP':'NOT RUN'}))
'''


def qualify(image):
    namespace = 'tls-ci-' + uuid4().hex[:12]
    build_label = 'io.thermal-label.ci.build=' + os.environ.get('THERMAL_CI_BUILD_ID', namespace)
    network = namespace + '-net'
    volumes = [namespace + '-pg', namespace + '-minio']
    containers = [namespace + '-pg', namespace + '-minio', namespace + '-app']
    password = secrets.token_urlsafe(32)
    _SECRETS.add(password)
    environment = {key: value for key, value in os.environ.items() if not key.startswith('TLS_')}
    environment.update(POSTGRES_USER='ci', POSTGRES_DB='thermal_ci', POSTGRES_PASSWORD=password,
                       MINIO_ROOT_USER='ci-access', MINIO_ROOT_PASSWORD=password)
    created_containers, created_volumes = [], []
    created_network = False
    try:
        run(['docker', 'network', 'create', '--internal', '--label', LABEL + '=' + namespace, '--label', build_label, network])
        created_network = True
        for volume in volumes:
            run(['docker', 'volume', 'create', '--label', LABEL + '=' + namespace, '--label', build_label, volume])
            created_volumes.append(volume)
        run(['docker', 'run', '-d', '--name', containers[0], '--label', LABEL + '=' + namespace, '--label', build_label,
             '--network', network, '--network-alias', 'postgres', '--memory', '256m', '--cpus', '0.5',
             '-e', 'POSTGRES_USER', '-e', 'POSTGRES_DB', '-e', 'POSTGRES_PASSWORD',
             '-v', volumes[0] + ':/var/lib/postgresql/data', 'thermal-label-postgres:lan-ccc6e83d6e35'], environment=environment)
        created_containers.append(containers[0])
        run(['docker', 'run', '-d', '--name', containers[1], '--label', LABEL + '=' + namespace, '--label', build_label,
             '--network', network, '--network-alias', 'minio', '--memory', '512m', '--cpus', '0.5',
             '-e', 'MINIO_ROOT_USER', '-e', 'MINIO_ROOT_PASSWORD', '-v', volumes[1] + ':/data',
             'thermal-label-minio:lan-3e39c5a47f52', 'server', '/data'], environment=environment)
        created_containers.append(containers[1])
        for _ in range(30):
            try:
                run(['docker', 'exec', containers[0], 'pg_isready', '-U', 'ci', '-d', 'thermal_ci'])
                break
            except RuntimeError: time.sleep(1)
        else: raise RuntimeError('CI PostgreSQL unavailable.')
        run(['docker', 'exec', '-i', containers[0], 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'ci', '-d', 'thermal_ci'],
            data=Path('backend/schema/008_auth.sql').read_bytes())
        environment.update(TLS_DATABASE_URL=f'postgresql://ci:{password}@postgres:5432/thermal_ci',
                           TLS_MINIO_ENDPOINT='minio:9000', TLS_MINIO_ACCESS_KEY='ci-access',
                           TLS_MINIO_SECRET_KEY=password, TLS_MINIO_BUCKET='ci-layouts',
                           TLS_MINIO_SECURE='false', TLS_AUTH_LOCAL_HTTP='true',
                           TLS_AUTH_ORIGINS='http://127.0.0.1:8000', TLS_STORAGE_INITIALIZE='true',
                           TLS_QUEUE_ENABLED='false', TLS_SAP_RFC_ENABLED='false', TLS_PRINTER_HOST='')
        args = ['docker', 'run', '-d', '--name', containers[2], '--label', LABEL + '=' + namespace, '--label', build_label,
                '--network', network, '--memory', '512m', '--cpus', '1', '--pids-limit', '64',
                '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m']
        for key in environment:
            if key.startswith('TLS_'): args += ['-e', key]
        args += [image]
        run(args, environment=environment)
        created_containers.append(containers[2])
        def ready():
            for _ in range(45):
                try:
                    run(['docker', 'exec', containers[2], 'python', '-c', "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready',timeout=2).read()"], timeout=5)
                    return
                except RuntimeError: time.sleep(1)
            logs = run(['docker', 'logs', '--tail', '20', containers[2]])
            raise RuntimeError('CI application unavailable: ' + sanitized(logs))
        ready()
        payload = {'phase': 'prepare', 'temporary': secrets.token_urlsafe(24), 'password': secrets.token_urlsafe(24)}
        _SECRETS.update((payload['temporary'], payload['password']))
        initial = json.loads(run(['docker', 'exec', '-i', containers[2], 'python', '-c', CLIENT], data=json.dumps(payload).encode()))
        monitor_result = 'NOT RUN (host is not Linux)'
        if os.name == 'posix':
            import ci_host
            parent = Path('.tmp').resolve()
            parent.mkdir(exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=namespace + '-monitor-', dir=parent) as temporary:
                sandbox = Path(temporary)
                for name in ('app', 'state', 'backups'): (sandbox / name).mkdir()
                (sandbox / 'app/current').symlink_to(Path.cwd())
                attributes = ('APP', 'STATE', 'BACKUPS', 'CONTAINERS', 'healthy')
                original = {key: getattr(ci_host, key) for key in attributes}
                def fixture_health():
                    try:
                        run(['docker', 'exec', containers[2], 'python', '-c', "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready',timeout=2)"], timeout=5)
                        return True
                    except RuntimeError:
                        return False
                try:
                    ci_host.APP, ci_host.STATE, ci_host.BACKUPS = sandbox/'app', sandbox/'state', sandbox/'backups'
                    ci_host.CONTAINERS = dict(zip(('postgres', 'minio', 'app'), containers))
                    ci_host.healthy = fixture_health
                    ci_host.monitor(); assert ci_host.monitor()['state'] == 'UP'
                    run(['docker', 'stop', containers[2]])
                    ci_host.monitor(); ci_host.monitor()
                    assert ci_host.monitor()['state'] == 'DOWN'
                    run(['docker', 'start', containers[2]])
                    ready()
                    ci_host.monitor(); assert ci_host.monitor()['state'] == 'UP'
                    monitor_result = 'PASS (real disposable app stopped, detected, restarted, recovered)'
                finally:
                    for key, value in original.items(): setattr(ci_host, key, value)
        else:
            run(['docker', 'restart', containers[2]])
            ready()
        payload.update(phase='after_restart', dataset_id=initial['dataset_id'])
        restored = json.loads(run(['docker', 'exec', '-i', containers[2], 'python', '-c', CLIENT], data=json.dumps(payload).encode()))
        return {'status': 'PASS', 'namespace': namespace, 'exact_image': image,
                'login_roles_save_preview_logout': initial['status'], 'restart_persistence': restored['status'],
                'monitor_fault_recovery': monitor_result,
                'storage': 'ISOLATED REAL POSTGRESQL/MINIO', 'network': 'INTERNAL; no published port',
                'SAP': 'NOT RUN', 'printer': 'NOT RUN'}
    finally:
        for name in reversed(created_containers):
            record = json.loads(run(['docker', 'inspect', name]))[0]
            if record['Config']['Labels'].get(LABEL) != namespace: raise ValueError('Unsafe fixture cleanup')
            run(['docker', 'rm', '-f', name])
        for name in reversed(created_volumes):
            record = json.loads(run(['docker', 'volume', 'inspect', name]))[0]
            if record['Labels'].get(LABEL) != namespace: raise ValueError('Unsafe fixture cleanup')
            run(['docker', 'volume', 'rm', name])
        if created_network:
            record = json.loads(run(['docker', 'network', 'inspect', network]))[0]
            if record['Labels'].get(LABEL) != namespace: raise ValueError('Unsafe network cleanup')
            run(['docker', 'network', 'rm', network])


if __name__ == '__main__':
    import sys
    try:
        print(json.dumps(qualify(sys.argv[1]), indent=2))
    except Exception as error:
        print(json.dumps({'status': 'FAIL', 'reason': 'candidate_acceptance_failed', 'diagnostic': sanitized(error), 'operational_storage': 'NOT TOUCHED'}))
        raise SystemExit(1) from None
