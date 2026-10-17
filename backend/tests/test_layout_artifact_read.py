"""Concrete reader integrity/limits with fake SQL and object-store streams."""
from datetime import datetime, timezone
import hashlib
from io import BytesIO
from types import SimpleNamespace
import pytest
from app.layouts.service import LayoutService, LayoutArtifactError, LayoutNotFoundError, LayoutPersistenceError

SVG = b'<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 160 120"><rect width="10" height="10" /></svg>'


class Stream(BytesIO):
    def read(self, size=-1):
        self.requested = size
        return super().read(size)
    def release_conn(self):
        self.released = True


class SQL:
    def __init__(self, row): self.row = row
    def connect(self, *a): return self
    def __enter__(self): return self
    def __exit__(self, *a): pass
    def cursor(self): return self
    def execute(self, sql, parameters):
        assert 'deleted_at IS NULL' in sql and parameters == ('A',)
    def fetchone(self): return self.row


def reader(payload=SVG, checksum=None, *, missing=False, unavailable=False):
    stream = Stream(payload)
    row = ('A', 'Synthetic', 4, 40, 30, 203, checksum or hashlib.sha256(payload).hexdigest(),
           'fake/A/v4', datetime.now(timezone.utc))
    service = LayoutService.__new__(LayoutService)
    service.settings = SimpleNamespace(database_url='fake', minio_bucket='fake')
    service._database = SQL(None if missing else row)
    def get_object(bucket, key):
        if unavailable: raise RuntimeError('private object-store details')
        assert (bucket, key) == ('fake','fake/A/v4')
        return stream
    service.client = SimpleNamespace(get_object=get_object)
    return service, stream


def test_exact_artifact_bytes_checksum_and_bounded_read():
    service, stream = reader()
    result = service.get_layout('A')
    assert result.svg.encode() == SVG
    assert result.svg_sha256 == hashlib.sha256(result.svg.encode()).hexdigest()
    assert stream.requested == 512 * 1024 + 1 and stream.closed and stream.released


def test_historical_reader_selects_requested_version_and_checks_exact_artifact():
    service, stream = reader()
    calls = []
    def execute(sql, params):
        calls.append((sql, params))
        assert 'v.version = %s' in sql and 'deleted_at IS NULL' in sql
        assert params == (4, 'A')
    service._database.execute = execute
    result = service.get_layout('A', 4)
    assert result.version == 4 and result.svg.encode() == SVG
    assert len(calls) == 1 and stream.closed


def test_version_history_returns_original_titles_in_descending_order():
    service, _ = reader()
    database = service._database
    def execute(sql, params):
        assert 'ORDER BY v.version DESC' in sql and 'deleted_at IS NULL' in sql
        assert 'title_override' not in sql and params == ('A',)
    database.execute = execute
    database.fetchall = lambda: [database.row, (*database.row[:2], 3, *database.row[3:])]
    assert [item.version for item in service.list_versions('A')] == [4, 3]


@pytest.mark.parametrize('payload,checksum', [(SVG,'0'*64), (b'x' * (512 * 1024 + 100),None),
    (b'\xff',None), (b'<svg><script/></svg>',None)], ids=['checksum','size','utf8','unsafe'])
def test_corrupt_or_oversized_artifact_is_distinct_and_closed(payload,checksum):
    service, stream = reader(payload,checksum)
    with pytest.raises(LayoutArtifactError): service.get_layout('A')
    assert stream.closed and stream.released and stream.requested == 512 * 1024 + 1


def test_missing_or_deleted_distinct_from_unavailable():
    service, _ = reader(missing=True)
    with pytest.raises(LayoutNotFoundError): service.get_layout('A')
    service, _ = reader(unavailable=True)
    with pytest.raises(LayoutPersistenceError) as caught: service.get_layout('A')
    assert not isinstance(caught.value, LayoutArtifactError)
