"""Restore authenticated CI archives only into fresh, fixed CI volume names."""
import argparse
import json
from pathlib import Path
import subprocess
from uuid import uuid4

ROOT = Path('/opt/thermal-label-studio/ci-bootstrap')
BACKUP = Path('/var/backups/thermal-label-ci')
EXPECTED = {'thermal-label-ci-' + name for name in
            ('jenkins-home', 'sonar-db', 'sonar-data', 'sonar-extensions', 'sonar-logs', 'sonar-temp')}


def run(args, *, data=None, timeout=120):
    result = subprocess.run(list(map(str, args)), input=data, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('CI restore operation failed; preserve targets and private diagnostics.')
    return result.stdout


DECRYPT = '''import json,sys
from pathlib import Path
sys.path.insert(0,'/app/scripts')
from production_backup import decrypt,file_hash
manifest=json.loads(Path('/keys/migration.json').read_text())
key=Path('/keys/migration.key').read_bytes()
for item in manifest['volumes']:
 source=Path('/encrypted')/item['archive']
 if file_hash(source)!=item['sha256']: raise ValueError('Transfer checksum failed')
 output=Path('/plain')/(item['target']+'.tar.gz')
 decrypt(source,output,key)
 if file_hash(output)!=item['plain_sha256']: raise ValueError('Decrypted checksum failed')
print(json.dumps({'authenticated_archives':'PASS','count':len(manifest['volumes'])}))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--confirm-host')
    args = parser.parse_args()
    if not args.apply:
        print(json.dumps({'status': 'PLAN ONLY', 'volume_writes': 'NOT RUN'}))
        return
    if args.confirm_host != '192.168.254.58' or '192.168.254.58/' not in run(['ip', '-4', '-o', 'address', 'show']).decode():
        raise ValueError('Unexpected migration host')
    manifest = json.loads((ROOT / 'private/migration.json').read_text())
    if {v['target'] for v in manifest['volumes']} != EXPECTED or len(manifest['volumes']) != 6:
        raise ValueError('Unexpected volume inventory')
    for item in manifest['volumes']:
        if item['archive'] != item['target'] + '.tlsci':
            raise ValueError('Unexpected archive name')
        if subprocess.run(['docker', 'volume', 'inspect', item['target']], capture_output=True).returncode == 0:
            raise ValueError('Refuse an existing CI volume; inspect any previous partial migration.')
    migration = uuid4().hex
    private = BACKUP / ('restore-' + migration)
    private.mkdir(mode=0o700, exist_ok=False)
    run(['docker', 'run', '--rm', '--user', '1000:1000', '--network', 'none', '--read-only',
         '--mount', 'type=bind,source=' + str(ROOT / 'private') + ',target=/keys,readonly',
         '--mount', 'type=bind,source=' + str(ROOT / 'archives') + ',target=/encrypted,readonly',
         '--mount', 'type=bind,source=' + str(private) + ',target=/plain',
         '--entrypoint', 'python', 'thermal-label-maintenance:lan-aa5838ce8387', '-c', DECRYPT], timeout=1800)
    report = {'status': 'RESTORING', 'volumes': []}
    for item in manifest['volumes']:
        target = item['target']
        run(['docker', 'volume', 'create', '--label', 'io.thermal-label.ci.migration=' + migration, target])
        archive = private / (target + '.tar.gz')
        run(['docker', 'run', '--rm', '--user', '0:0', '--network', 'none', '--read-only',
             '--mount', 'type=volume,source=' + target + ',target=/volume',
             '--mount', 'type=bind,source=' + str(archive) + ',target=/backup.tar.gz,readonly',
             '--entrypoint', '/bin/sh', 'thermal-label-maintenance:lan-aa5838ce8387',
             '-c', 'test -z "$(ls -A /volume)" && tar -xzpf /backup.tar.gz -C /volume && tar -dzf /backup.tar.gz -C /volume'], timeout=1800)
        report['volumes'].append({'target': target, 'restore_and_compare': 'PASS'})
        (ROOT / 'private/restore-status.json').write_text(json.dumps(report, indent=2) + '\n')
        # Delete only this generated, verified temporary plaintext archive.
        archive.unlink()
        print('Restored and compared ' + target, flush=True)
    report['status'] = 'PASS'
    (ROOT / 'private/restore-status.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('CI restore failed; original and partial target volumes preserved.')
        raise SystemExit(1) from None
