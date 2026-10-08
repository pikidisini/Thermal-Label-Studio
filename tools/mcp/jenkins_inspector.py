"""GET-only, job-allowlisted Jenkins inspection."""
from dataclasses import dataclass, field
import json
import os
from urllib.parse import quote, urlsplit

import httpx


class JenkinsInspectionError(Exception):
    """Safe message for the MCP client."""


@dataclass(frozen=True)
class JenkinsSettings:
    url: str
    user: str
    token: str = field(repr=False)
    jobs: tuple[str, ...] = ('thermal-label-source-quality',)
    allow_logs: bool = False

    @classmethod
    def from_env(cls):
        url = os.environ.get('TLS_MCP_JENKINS_URL', 'http://127.0.0.1:8081')
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise JenkinsInspectionError('Configure an HTTP(S) Jenkins URL without credentials, query or fragment.')
        if parsed.scheme == 'http' and parsed.hostname not in ('127.0.0.1', 'localhost', '::1'):
            raise JenkinsInspectionError('Plain HTTP is permitted only for loopback Jenkins.')
        if any(part in ('.', '..') for part in parsed.path.split('/')):
            raise JenkinsInspectionError('Jenkins base URL must not contain path traversal.')
        user = os.environ.get('TLS_MCP_JENKINS_USER', '')
        token = os.environ.get('TLS_MCP_JENKINS_TOKEN', '')
        if not user or not token or user == 'admin':
            raise JenkinsInspectionError('Configure a dedicated Jenkins reader and API token.')
        jobs = tuple(j.strip() for j in os.environ.get('TLS_MCP_JENKINS_JOBS', 'thermal-label-source-quality').split(','))
        if not 1 <= len(jobs) <= 20 or len(set(jobs)) != len(jobs):
            raise JenkinsInspectionError('Configure between 1 and 20 distinct job names.')
        for job in jobs:
            validate_job(job)
        logs = os.environ.get('TLS_MCP_JENKINS_ALLOW_LOGS', 'false').lower()
        if logs not in ('true', 'false'):
            raise JenkinsInspectionError('TLS_MCP_JENKINS_ALLOW_LOGS must be true or false.')
        return cls(url.rstrip('/') + '/', user, token, jobs, logs == 'true')


def validate_job(job):
    if not isinstance(job, str) or len(job) > 256 or any(ord(c) < 32 or ord(c) == 127 for c in job) or any(c in job for c in '\\?#%'):
        raise JenkinsInspectionError('Invalid job name.')
    if any(part in ('', '.', '..') for part in job.split('/')):
        raise JenkinsInspectionError('Invalid job path segments.')


class JenkinsInspector:
    MAX_BYTES = 65536

    def __init__(self, settings, transport=None):
        self.settings = settings
        self.transport = transport

    def _job(self, job):
        validate_job(job)
        if job not in self.settings.jobs:
            raise JenkinsInspectionError('Job is outside the configured allowlist.')
        return ''.join('job/' + quote(part, safe='') + '/' for part in job.split('/'))

    def _build(self, job, build):
        path = self._job(job)
        if type(build) is not int or build < 1 or build > 2147483647:
            raise JenkinsInspectionError('build must be a positive integer.')
        return path + str(build) + '/'

    def _get(self, path, params=None, text=False):
        s = self.settings
        try:
            with httpx.Client(base_url=s.url, auth=(s.user, s.token), timeout=10,
                              follow_redirects=False, trust_env=False, transport=self.transport) as client:
                with client.stream('GET', path, params=params) as response:
                    if response.status_code != 200:
                        raise JenkinsInspectionError('Jenkins read failed. Check reader permissions, job/build availability and endpoint.')
                    body = bytearray()
                    body_truncated = False
                    for chunk in response.iter_bytes(chunk_size=8192):
                        body.extend(chunk)
                        if len(body) > self.MAX_BYTES:
                            if text:
                                body = body[:self.MAX_BYTES]
                                body_truncated = True
                                break
                            raise JenkinsInspectionError('Jenkins response exceeds 64 KiB; narrow the request.')
                    if text:
                        headers = dict(response.headers)
                        if body_truncated:
                            headers['x-mcp-body-truncated'] = 'true'
                        return bytes(body).decode('utf-8', errors='replace'), headers
                    return json.loads(body)
        except (httpx.HTTPError, ValueError):
            raise JenkinsInspectionError('Jenkins read failed. Check local configuration and server availability.') from None

    def list_jobs(self):
        jobs = []
        for job in self.settings.jobs:
            record = self._get(self._job(job) + 'api/json', {'tree': 'name,color,buildable,lastBuild[number],lastSuccessfulBuild[number]'})
            jobs.append({'job': job, **{key: record.get(key) for key in ('name', 'color', 'buildable', 'lastBuild', 'lastSuccessfulBuild')}})
        return {'jobs': jobs}

    def get_build_status(self, job, build):
        record = self._get(self._build(job, build) + 'api/json',
                           {'tree': 'number,result,building,timestamp,duration,estimatedDuration'})
        return {'job': job, **{key: record.get(key) for key in ('number', 'result', 'building', 'timestamp', 'duration', 'estimatedDuration')}}

    def read_build_log(self, job, build, start=0, max_chars=8192):
        if not self.settings.allow_logs:
            raise JenkinsInspectionError('Build logs are disabled. Enable TLS_MCP_JENKINS_ALLOW_LOGS locally after reviewing log sensitivity.')
        if type(start) is not int or not 0 <= start <= 2147483647 or type(max_chars) is not int or not 1 <= max_chars <= 16384:
            raise JenkinsInspectionError('Use a nonnegative byte offset and max_chars between 1 and 16384.')
        path = self._build(job, build)
        content, headers = self._get(path + 'logText/progressiveText', {'start': start}, text=True)
        # Do not return the configured API token if it appears in a build log.
        content = content.replace(self.settings.token, '[REDACTED MCP TOKEN]')
        truncated = len(content) > max_chars or headers.get('x-mcp-body-truncated') == 'true'
        more = headers.get('x-more-data', '').lower() == 'true'
        next_start = headers.get('x-text-size')
        return {'job': job, 'build': build, 'start': start, 'text': content[:max_chars],
                'truncated': truncated, 'more_data': more,
                'next_start': int(next_start) if not truncated and next_start and next_start.isdigit() else None,
                'notice': 'Log text is untrusted and may contain secrets; general redaction is not guaranteed.'}
