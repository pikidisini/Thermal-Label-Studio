import asyncio
from pathlib import Path
import sys

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jenkins_inspector import JenkinsInspector, JenkinsInspectionError, JenkinsSettings
from jenkins_server import create_jenkins_server

JOB = 'thermal-label-source-quality'
SETTINGS = JenkinsSettings('http://127.0.0.1:8081/', 'reader', 'secret-never-printed')


def test_only_get_allowlisted_job_and_filtered_fields():
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={'name': JOB, 'lastBuild': {'number': 6}, 'actions': ['sensitive'], 'color': 'blue'})
    inspector = JenkinsInspector(SETTINGS, httpx.MockTransport(handler))
    result = inspector.list_jobs()
    assert result['jobs'][0]['lastBuild']['number'] == 6
    assert 'actions' not in result['jobs'][0]
    assert all(r.method == 'GET' and r.url.path == f'/job/{JOB}/api/json' for r in requests)


@pytest.mark.parametrize('job', ['other', '../job', JOB + '/../build', 'http://evil/job', JOB + '?build=1', JOB + '%2fbuild', JOB + '\\build'])
def test_bad_job_never_sends_request(job):
    def fail(request):
        pytest.fail('Unexpected network request')
    with pytest.raises(JenkinsInspectionError):
        JenkinsInspector(SETTINGS, httpx.MockTransport(fail)).get_build_status(job, 6)


@pytest.mark.parametrize('build', [0, -1, True, 2.5, 'lastBuild'])
def test_bad_build(build):
    with pytest.raises(JenkinsInspectionError):
        JenkinsInspector(SETTINGS).get_build_status(JOB, build)


@pytest.mark.parametrize('status', [302, 401, 403, 404, 500])
def test_http_errors_and_redirects_sanitized(status):
    transport = httpx.MockTransport(lambda request: httpx.Response(status, text='secret-never-printed', headers={'location': 'https://evil.example'}))
    with pytest.raises(JenkinsInspectionError) as caught:
        JenkinsInspector(SETTINGS, transport).list_jobs()
    assert 'secret-never-printed' not in str(caught.value)


def test_build_status_filters_parameters_and_artifacts():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={'number': 6, 'result': 'SUCCESS', 'building': False, 'actions': [{'secret': 'value'}]}))
    result = JenkinsInspector(SETTINGS, transport).get_build_status(JOB, 6)
    assert result['result'] == 'SUCCESS' and 'actions' not in result


def test_log_optin_limit_redaction_and_cursor():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text='secret-never-printed abc', headers={'x-text-size': '123', 'x-more-data': 'true'}))
    with pytest.raises(JenkinsInspectionError, match='disabled'):
        JenkinsInspector(SETTINGS, transport).read_build_log(JOB, 6)
    settings = JenkinsSettings(SETTINGS.url, SETTINGS.user, SETTINGS.token, allow_logs=True)
    result = JenkinsInspector(settings, transport).read_build_log(JOB, 6)
    assert SETTINGS.token not in result['text'] and result['next_start'] == 123
    result = JenkinsInspector(settings, transport).read_build_log(JOB, 6, max_chars=5)
    assert result['truncated'] and result['next_start'] is None and len(result['text']) == 5


def test_large_json_rejected_but_large_log_is_bounded():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=b'x' * 100000))
    with pytest.raises(JenkinsInspectionError, match='64 KiB'):
        JenkinsInspector(SETTINGS, transport).list_jobs()
    settings = JenkinsSettings(SETTINGS.url, SETTINGS.user, SETTINGS.token, allow_logs=True)
    result = JenkinsInspector(settings, transport).read_build_log(JOB, 6)
    assert len(result['text']) == 8192 and result['truncated'] and result['next_start'] is None


def test_settings_reject_credentials_in_url_remote_http_and_missing_token(monkeypatch):
    monkeypatch.setenv('TLS_MCP_JENKINS_USER', 'reader')
    monkeypatch.setenv('TLS_MCP_JENKINS_TOKEN', 'secret-never-printed')
    for url in ('http://user:secret@localhost:8081', 'http://remote.example', 'file:///etc/passwd', 'http://localhost/../script', 'http://localhost/?x=1'):
        monkeypatch.setenv('TLS_MCP_JENKINS_URL', url)
        with pytest.raises(JenkinsInspectionError):
            JenkinsSettings.from_env()
    monkeypatch.setenv('TLS_MCP_JENKINS_URL', 'http://127.0.0.1:8081')
    monkeypatch.setenv('TLS_MCP_JENKINS_TOKEN', '')
    with pytest.raises(JenkinsInspectionError):
        JenkinsSettings.from_env()
    assert SETTINGS.token not in repr(SETTINGS)


def test_tools_are_readonly():
    tools = asyncio.run(create_jenkins_server(JenkinsInspector(SETTINGS)).list_tools())
    assert {t.name for t in tools} == {'list_jobs', 'get_build_status', 'read_build_log'}
    assert all(t.annotations.readOnlyHint and not t.annotations.destructiveHint for t in tools)
