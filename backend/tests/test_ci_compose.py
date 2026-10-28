"""Parse CI configuration without daemon access or operational credentials."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import pytest

ROOT = Path(__file__).resolve().parents[2]


def test_ci_storage_is_separate_and_only_build_agent_receives_docker_socket():
    docker = shutil.which('docker')
    if docker is None: pytest.skip('Compose CLI unavailable')
    environment = {k:v for k,v in os.environ.items() if not k.startswith(('TLS_', 'SONAR_', 'COMPOSE_'))}
    environment.update(COMPOSE_DISABLE_ENV_FILE='1', TLS_CI_JENKINS_IMAGE='synthetic:jenkins',
                       TLS_CI_AGENT_IMAGE='synthetic:agent', TLS_CI_POSTGRES_IMAGE='synthetic:postgres',
                       TLS_CI_SONAR_IMAGE='synthetic:sonar', TLS_CI_DOCKER_GID='999',
                       SONAR_DB_PASSWORD='synthetic-only', SONAR_AUTH_JWTBASE64HS256SECRET='synthetic-only')
    result = subprocess.run([docker,'compose','-f','tools/jenkins/server/compose.yml','config','--format','json'],
                            cwd=ROOT, env=environment, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    model = json.loads(result.stdout)
    for name in ('jenkins', 'monitor-agent'):
        assert all(v['target'] != '/var/run/docker.sock' for v in model['services'][name]['volumes'])
    assert any(v['target'] == '/var/run/docker.sock' for v in model['services']['build-agent']['volumes'])
    assert model['services']['sonarqube']['tmpfs'] == ['/tmp:size=256m,mode=1777']
    assert all(v['external'] and v['name'].startswith('thermal-label-ci-') for v in model['volumes'].values())
    assert not model['services']['sonar-db'].get('ports')
