import asyncio
import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
import urllib3

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from minio_inspector import MinioInspector, MinioSettings, ObjectInspectionError
from minio_server import create_minio_server


SETTINGS = MinioSettings('127.0.0.1:9002', 'reader', 'secret-not-for-logs')
KEY = 'layouts/example/v1/layout.svg'


class Response(BytesIO):
    released = False

    def release_conn(self):
        self.released = True


class Client:
    def __init__(self, payload=b'<svg/>', size=None):
        self.payload = payload
        self.size = len(payload) if size is None else size
        self.calls = []
        self.response = Response(payload)

    def list_objects(self, bucket, **kwargs):
        self.calls.append(('list', bucket, kwargs))
        return iter([self.object(KEY), self.object('layouts/example/v2/layout.svg')])

    def object(self, key):
        return SimpleNamespace(object_name=key, size=self.size, etag='etag',
                               last_modified=None, version_id='v1', content_type='image/svg+xml')

    def stat_object(self, bucket, key):
        self.calls.append(('stat', bucket, key))
        return self.object(key)

    def get_object(self, bucket, key, **kwargs):
        self.calls.append(('get', bucket, key, kwargs))
        return self.response


def test_listing_pagination_and_fixed_bucket():
    client = Client()
    result = MinioInspector(SETTINGS, client).list_objects(limit=1)
    assert result['truncated'] and result['next_start_after'] == KEY
    assert len(result['objects']) == 1
    assert client.calls[0][1] == 'thermal-label-layouts'
    assert client.calls[0][2]['prefix'] == 'layouts/'
    assert 'metadata' not in result['objects'][0]


@pytest.mark.parametrize('key', ['outside/key.svg', 'layouts2/key.svg', 'layouts/../key.svg', 'layouts/./key.svg', 'layouts/\\key.svg', 'layouts/\nkey.svg', 'layouts/', 'layouts/' + 'x' * 1024])
def test_keys_rejected_before_network(key):
    client = Client()
    with pytest.raises(ObjectInspectionError):
        MinioInspector(SETTINGS, client).stat_object(key)
    assert client.calls == []


@pytest.mark.parametrize('limit', [0, 101, True, 1.5])
def test_bad_limit(limit):
    client = Client()
    with pytest.raises(ObjectInspectionError):
        MinioInspector(SETTINGS, client).list_objects(limit=limit)
    assert not client.calls


def test_cursor_scope_and_server_response_scope():
    client = Client()
    with pytest.raises(ObjectInspectionError):
        MinioInspector(SETTINGS, client).list_objects(prefix='layouts/example/', start_after='layouts/other/v1/layout.svg')
    assert not client.calls
    client.list_objects = lambda *args, **kwargs: iter([client.object('outside/file.svg')])
    with pytest.raises(ObjectInspectionError):
        MinioInspector(SETTINGS, client).list_objects()


def test_stat_only_returns_selected_metadata():
    result = MinioInspector(SETTINGS, Client()).stat_object(KEY)
    assert result['content_type'] == 'image/svg+xml'
    assert result['size_bytes'] == 6
    assert 'secret_key' not in result and 'metadata' not in result


def test_svg_checksum_and_response_cleanup():
    client = Client()
    digest = hashlib.sha256(client.payload).hexdigest()
    result = MinioInspector(SETTINGS, client).read_layout_svg(KEY, digest)
    assert result['svg'] == '<svg/>' and result['sha256'] == digest
    assert result['checksum_verified'] is True
    assert client.response.closed and client.response.released
    assert client.calls[-1][-1]['version_id'] == 'v1'


@pytest.mark.parametrize('payload,size,message', [(b'\xff', None, 'UTF-8'), (b'x' * 65537, 1, '64 KiB'), (b'<svg/>', None, 'checksum')], ids=['invalid-utf8', 'stream-oversize', 'checksum-mismatch'])
def test_svg_rejected_and_connection_released(payload, size, message):
    client = Client(payload, size)
    digest = '0' * 64 if message == 'checksum' else ''
    with pytest.raises(ObjectInspectionError, match=message):
        MinioInspector(SETTINGS, client).read_layout_svg(KEY, digest)
    assert client.response.closed and client.response.released


def test_oversize_stat_rejects_before_get():
    client = Client(size=65537)
    with pytest.raises(ObjectInspectionError):
        MinioInspector(SETTINGS, client).read_layout_svg(KEY)
    assert [c[0] for c in client.calls] == ['stat']


def test_non_svg_and_invalid_digest_rejected_before_network():
    client = Client()
    inspector = MinioInspector(SETTINGS, client)
    for key, digest in [('layouts/example/file.png', ''), (KEY, 'bad-digest')]:
        with pytest.raises(ObjectInspectionError):
            inspector.read_layout_svg(key, digest)
    assert not client.calls


def test_http_errors_are_sanitized():
    client = Client()
    def fail(*args):
        raise urllib3.exceptions.HTTPError('secret-not-for-logs')
    client.stat_object = fail
    with pytest.raises(ObjectInspectionError) as caught:
        MinioInspector(SETTINGS, client).stat_object(KEY)
    assert 'secret-not-for-logs' not in str(caught.value)


def test_settings_reject_root_missing_and_invalid_values(monkeypatch):
    monkeypatch.setenv('TLS_MCP_MINIO_ACCESS_KEY', '')
    monkeypatch.setenv('TLS_MCP_MINIO_SECRET_KEY', '')
    with pytest.raises(ObjectInspectionError):
        MinioSettings.from_env()
    monkeypatch.setenv('TLS_MCP_MINIO_ACCESS_KEY', 'root-for-test')
    monkeypatch.setenv('TLS_MCP_MINIO_SECRET_KEY', 'secret-not-for-logs')
    with pytest.raises(ObjectInspectionError, match='root account'):
        MinioSettings.from_env(root_access_key='root-for-test')
    monkeypatch.setenv('TLS_MCP_MINIO_ACCESS_KEY', 'reader')
    for variable, value in [('TLS_MCP_MINIO_ENDPOINT', 'http://localhost:9002'), ('TLS_MCP_MINIO_ENDPOINT', 'localhost:99999'), ('TLS_MCP_MINIO_SECURE', 'yes'), ('TLS_MCP_MINIO_BUCKET', '../bucket')]:
        with monkeypatch.context() as context:
            context.setenv(variable, value)
            with pytest.raises(ObjectInspectionError):
                MinioSettings.from_env()
    assert 'secret-not-for-logs' not in repr(SETTINGS)


def test_tools_and_policy_have_only_intended_reads():
    tools = asyncio.run(create_minio_server(MinioInspector(SETTINGS, Client())).list_tools())
    assert {t.name for t in tools} == {'list_objects', 'stat_object', 'read_layout_svg'}
    assert all(t.annotations.readOnlyHint and not t.annotations.destructiveHint for t in tools)
    policy = json.loads((Path(__file__).resolve().parents[1] / 'minio-reader-policy.json').read_text())
    actions = {action for statement in policy['Statement'] for action in statement['Action']}
    assert actions == {'s3:ListBucket', 's3:GetBucketLocation', 's3:GetObject', 's3:GetObjectVersion'}
    assert policy['Statement'][1]['Condition']['StringLike']['s3:prefix'] == ['layouts/*']


def test_svg_encoded_response_bound():
    client = Client(b'\x01' * 30000)
    with pytest.raises(ObjectInspectionError, match='128 KiB'):
        MinioInspector(SETTINGS, client).read_layout_svg(KEY)
