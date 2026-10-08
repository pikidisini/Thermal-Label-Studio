"""Explicit admin action; capture generated credentials locally without logging them."""
import json
from pathlib import Path
import sys

from dotenv import dotenv_values
import httpx

base = Path(__file__).resolve().parent


def main():
    credentials = dotenv_values(base / '.env.jenkins-admin')
    user = credentials.get('TLS_JENKINS_ADMIN_USER')
    token = credentials.get('TLS_JENKINS_ADMIN_TOKEN')
    destination = base / '.env.jenkins'
    if not user or not token or destination.exists():
        raise ValueError('Admin credentials missing or reader configuration already exists; no overwrite')
    with httpx.Client(base_url='http://127.0.0.1:8081/', auth=(user, token),
                      timeout=30, follow_redirects=False, trust_env=False) as client:
        # API tokens authenticate this explicit admin action; never disable CSRF.
        response = client.post('scriptText', data={'script': (base / 'Provision-JenkinsReader.groovy').read_text()})
        response.raise_for_status()
        record = json.loads(response.text.strip())
        if record.get('username') != 'thermal_label_ai_readonly' or not record.get('permissionsVerified'):
            raise ValueError('Unexpected provisioning response; inspect Jenkins state before retrying')
        with destination.open('x', encoding='utf-8') as handle:
            handle.write('TLS_MCP_JENKINS_URL=http://127.0.0.1:8081\n'
                         'TLS_MCP_JENKINS_USER=thermal_label_ai_readonly\n'
                         f'TLS_MCP_JENKINS_TOKEN={record["token"]}\n'
                         f'TLS_MCP_JENKINS_PASSWORD={record["password"]}\n'
                         'TLS_MCP_JENKINS_JOBS=thermal-label-source-quality\n'
                         'TLS_MCP_JENKINS_ALLOW_LOGS=false\n')
        print(json.dumps({'provision': 'PASS', 'user': record['username'],
                          'authorization': record['authorization'], 'permissions_verified': True,
                          'credentials': 'Saved locally; password and token not printed'}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'provision': 'BLOCKED' if isinstance(exc, ValueError) else 'FAIL',
                          'error_type': type(exc).__name__,
                          'reason': 'Admin credentials required; inspect Jenkins state before retrying. Details suppressed.'}))
        sys.exit(1)
