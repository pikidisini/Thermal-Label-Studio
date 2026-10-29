"""Trusted-main Linux CI stages; operational effects belong to ci_host.py."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
REPORTS = None  # Set only from a validated per-build identifier in main.


def run(args, *, timeout=3600, log=None):
    result = subprocess.run(list(map(str, args)), cwd=ROOT, capture_output=True, timeout=timeout)
    if log:
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_bytes(result.stdout + b'\n' + result.stderr)
    if result.returncode:
        raise RuntimeError('CI stage failed; inspect its source-only report.')
    return result.stdout


def source(sha):
    REPORTS.mkdir(parents=True, exist_ok=False)
    image = 'thermal-label-ci-runner:' + sha
    name = 'tls-ci-quality-' + uuid4().hex[:12]
    run(['docker', 'build', '--label', 'io.thermal-label.ci.runner=true', '-t', image,
         '-f', 'tools/coverage-linux/Dockerfile', '.'], log=REPORTS / 'runner-build.log')
    run(['docker', 'create', '--name', name, '--label', 'io.thermal-label.ci.fixture=' + name,
         '--label', 'io.thermal-label.ci.build=' + os.environ['THERMAL_CI_BUILD_ID'],
         '--network', 'none', '--memory', '4g', '--cpus', '2', '--pids-limit', '512',
         '-e', 'TLS_RENDERER_PATH=/renderer/resvg', image])
    try:
        result = subprocess.run(['docker', 'start', '-a', name], cwd=ROOT, capture_output=True, timeout=7200)
        (REPORTS / 'source-gate.log').write_bytes(result.stdout + b'\n' + result.stderr)
        run(['docker', 'cp', name + ':/workspace/.tmp/.', REPORTS])
        if result.returncode:
            raise RuntimeError('Measured source/browser checks failed.')
    finally:
        run(['docker', 'rm', '-f', name])
    directories = [path.parent for path in REPORTS.glob('coverage-*/result.json')]
    if len(directories) != 1:
        raise ValueError('Coverage report is absent or ambiguous.')
    from check_coverage import verify_reports
    verify_reports(directories[0])
    (REPORTS / 'coverage-directory.txt').write_text(str(directories[0]))
    print(json.dumps({'source_and_mock_browser': 'PASS', 'commit': sha}))


def sonar(sha):
    from check_coverage import verify_reports
    directory = Path((REPORTS / 'coverage-directory.txt').read_text())
    verify_reports(directory)
    environment = os.environ
    if not environment.get('SONAR_TOKEN'):
        raise ValueError('Scoped Sonar credential is missing.')
    # Token stays in environment; no credential value in arguments.
    run(['/opt/sonar-scanner/bin/sonar-scanner', '-Dsonar.host.url=http://sonarqube:9000',
         '-Dsonar.python.version=3.14', '-Dsonar.projectVersion=' + sha,
         '-Dsonar.buildString=commit=' + sha,
         '-Dsonar.working.directory=' + str(REPORTS / 'scanner'),
         '-Dsonar.python.coverage.reportPaths=' + str(directory / 'python.xml'),
         '-Dsonar.javascript.lcov.reportPaths=' + str(directory / 'frontend/lcov.info'),
         '-Dsonar.qualitygate.wait=true'], timeout=1800, log=REPORTS / 'sonar.log')
    print(json.dumps({'quality_gate': 'PASS', 'commit': sha}))


def image(sha):
    image = 'thermal-label-studio:git-' + sha
    source_checksum = hashlib.sha256(run(['git', 'archive', '--format=tar', sha])).hexdigest()
    run(['docker', 'build', '--platform', 'linux/amd64', '--label', 'io.thermal-label.ci.release=true',
         '--label', 'org.opencontainers.image.revision=' + sha,
         '--build-arg', 'RESVG_SHA256=450cfeaf8122f7389a8acf698888804e1ed46980b611d5253204049c51c87087',
         '-t', image, '.'], log=REPORTS / 'application-build.log')
    identity = json.loads(run(['docker', 'image', 'inspect', image]))[0]['Id']
    from ci_candidate import qualify
    result = qualify(image)
    result.update(commit=sha, image=image, image_id=identity, source_archive_sha256=source_checksum)
    (REPORTS / 'candidate.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


def deploy(sha):
    result = json.loads((REPORTS / 'candidate.json').read_text())
    if result.get('status') != 'PASS' or result.get('commit') != sha:
        raise ValueError('Candidate evidence does not match the release.')
    from ci_host import deploy as apply
    report = apply(ROOT, sha, result['image_id'])
    (REPORTS / 'deployment.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


def clean(sha):
    """Cleanup is limited to this build's labeled temporary resources."""
    marker = 'io.thermal-label.ci.build=' + os.environ['THERMAL_CI_BUILD_ID']
    for kind in ('container', 'volume', 'network'):
        args = ['docker', kind, 'ls', '-q', '--filter', 'label=' + marker]
        if kind == 'container': args.insert(3, '-a')
        for identity in run(args).decode().split():
            item = json.loads(run(['docker', kind, 'inspect', identity]))[0]
            labels = item.get('Labels') or item.get('Config', {}).get('Labels') or {}
            if not item['Name'].lstrip('/').startswith('tls-ci-') or not labels.get('io.thermal-label.ci.fixture'):
                raise ValueError('Refuse cleanup of an unrelated resource.')
            operation = ['docker', kind, 'rm'] + (['-f'] if kind == 'container' else []) + [identity]
            run(operation)
    candidate = REPORTS / 'candidate.json'
    accepted = candidate.exists() and json.loads(candidate.read_text()).get('status') == 'PASS'
    if not accepted:
        tag = 'thermal-label-studio:git-' + sha
        inspected = subprocess.run(['docker', 'image', 'inspect', tag], capture_output=True)
        if inspected.returncode == 0:
            labels = json.loads(inspected.stdout)[0]['Config'].get('Labels') or {}
            if labels.get('io.thermal-label.ci.release') == 'true' and labels.get('org.opencontainers.image.revision') == sha:
                # No force: an active container always protects its image.
                subprocess.run(['docker', 'image', 'rm', tag], capture_output=True)
    if REPORTS.exists():
        expected = ROOT.resolve() / '.tmp'
        if REPORTS.is_symlink() or REPORTS.resolve().parent != expected:
            raise ValueError('Unsafe report cleanup path.')
        shutil.rmtree(REPORTS)
    subprocess.run(['docker', 'image', 'rm', 'thermal-label-ci-runner:' + sha], capture_output=True)
    print(json.dumps({'temporary_build_resources': 'CLEANED', 'operational_storage': 'NOT TOUCHED'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=('source', 'sonar', 'image', 'deploy', 'clean'))
    parser.add_argument('--commit', required=True)
    parser.add_argument('--run-id', default=os.environ.get('BUILD_TAG'))
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.commit):
        parser.error('An exact Git revision is required.')
    if not args.run_id or not re.fullmatch('[A-Za-z0-9_-]{1,128}', args.run_id):
        parser.error('A unique Jenkins BUILD_TAG or --run-id is required.')
    REPORTS = ROOT / '.tmp' / ('ci-' + args.run_id)
    os.environ['THERMAL_CI_BUILD_ID'] = args.run_id
    def interrupted(signum, frame):
        raise RuntimeError('CI execution interrupted; rollback/cleanup required.')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    if run(['git', 'rev-parse', 'HEAD']).decode().strip() != args.commit:
        raise SystemExit('Workspace does not match requested commit.')
    globals()[args.stage](args.commit)
