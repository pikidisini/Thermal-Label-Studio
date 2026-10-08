from contextlib import nullcontext
from pathlib import Path
import sys

import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from postgres import Inspector, InspectionError, Settings
from server import create_server


SETTINGS = Settings("127.0.0.1", 5434, "thermal_label_studio", "reader", "test-only")


class Cursor:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.calls = []

    def execute(self, query, params=None):
        self.calls.append((query, params))

    def fetchone(self):
        return next(self.replies)

    def fetchall(self):
        return next(self.replies)

    def fetchmany(self, size):
        return next(self.replies)[:size]


def inspector_with(replies):
    cur = Cursor([(False,) * 5, (False,), (False,), *replies])

    class Connection:
        def cursor(self):
            return nullcontext(cur)

    options = {}

    def connect(**kwargs):
        options.update(kwargs)
        return nullcontext(Connection())

    return Inspector(SETTINGS, connect), cur, options


def test_transactions_are_readonly_and_bounded():
    inspector, cur, options = inspector_with([[('layouts',)]])
    assert inspector.list_tables()['tables'] == ['layouts']
    assert cur.calls[0][0] == 'SET TRANSACTION READ ONLY'
    assert 'default_transaction_read_only=on' in options['options']
    assert 'statement_timeout=5000' in options['options']
    assert options['connect_timeout'] == 5


def test_table_listing_reports_truncation():
    inspector, _, _ = inspector_with([[(f'table_{i}',) for i in range(201)]])
    result = inspector.list_tables()
    assert len(result['tables']) == 200
    assert result['truncated'] is True


@pytest.mark.parametrize('flags', [(True, False, False, False, False), (False, True, False, False, False), (False, False, True, False, False), (False, False, False, True, False), (False, False, False, False, True)])
def test_privileged_roles_rejected(flags):
    inspector, cur, _ = inspector_with([])
    cur.replies = iter([flags])
    with pytest.raises(InspectionError, match='unprivileged'):
        inspector.list_tables()


@pytest.mark.parametrize('replies,message', [([(False,) * 5, (True,)], 'memberships'), ([(False,) * 5, (False,), (True,)], 'write privileges')])
def test_memberships_and_write_grants_rejected(replies, message):
    inspector, cur, _ = inspector_with([])
    cur.replies = iter(replies)
    with pytest.raises(InspectionError, match=message):
        inspector.list_tables()


def test_table_and_column_injection_are_not_executed():
    inspector, cur, _ = inspector_with([[]])
    attack = 'layouts; DROP TABLE layouts'
    with pytest.raises(InspectionError, match='unavailable'):
        inspector.read_table(attack, ['label_code'])
    assert cur.calls[-1][1] == ('label_studio', attack)
    inspector, cur, _ = inspector_with([[('label_code', 'text', True)]])
    with pytest.raises(InspectionError, match='columns'):
        inspector.read_table('layouts', ['label_code; DELETE FROM layouts'])
    assert len(cur.calls) == 5


@pytest.mark.parametrize('limit', [0, 101, True, 1.5])
def test_invalid_limits_rejected_before_connect(limit):
    inspector, cur, _ = inspector_with([])
    with pytest.raises(InspectionError, match='limit'):
        inspector.read_table('layouts', ['label_code'], limit)
    assert cur.calls == []


@pytest.mark.parametrize('columns', [[], ['x', 'x'], ['x'] * 21, [None]])
def test_invalid_columns_rejected_before_connect(columns):
    inspector, cur, _ = inspector_with([])
    with pytest.raises(InspectionError, match='column'):
        inspector.read_table('layouts', columns)
    assert cur.calls == []


def test_rows_null_and_truncation_are_explicit():
    inspector, cur, _ = inspector_with([[('x', 'text', False)], [(None,), ('0',), ('extra',)]])
    result = inspector.read_table('layouts', ['x'], 2)
    assert result['rows'] == [[None], ['0']]
    assert result['truncated'] is True
    assert cur.calls[-1][1] == (3,)


def test_quoted_identifiers_and_database_cell_bound():
    name = 'odd"name'
    inspector, cur, _ = inspector_with([[(name, 'text', False)], [('value',)]])
    inspector.read_table('layouts', [name])
    rendered = cur.calls[-1][0].as_string()
    assert 'left("odd""name"::text, 4097)' in rendered
    assert 'FROM "label_studio"."layouts" LIMIT %s' in rendered


def test_cell_and_response_limits():
    inspector, _, _ = inspector_with([[('x', 'text', False)], [('a' * 4097,)]])
    result = inspector.read_table('layouts', ['x'])
    assert len(result['rows'][0][0]) == 4096
    assert result['truncated_cells'] == [{'row': 0, 'column': 'x'}]
    inspector, _, _ = inspector_with([[('x', 'text', False)], [('a' * 4096,)] * 25])
    with pytest.raises(InspectionError, match='64 KiB'):
        inspector.read_table('layouts', ['x'])


def test_description():
    inspector, _, _ = inspector_with([[('label_code', 'text', True)], [('layouts_pkey', 'PRIMARY KEY (label_code)')]])
    result = inspector.describe_table('layouts')
    assert result['columns'][0]['nullable'] is False
    assert result['constraints'][0]['name'] == 'layouts_pkey'


def test_driver_errors_do_not_leak_credentials():
    def failing_connect(**kwargs):
        raise psycopg.OperationalError('password=test-only sensitive-value')
    with pytest.raises(InspectionError) as caught:
        Inspector(SETTINGS, failing_connect).list_tables()
    assert 'test-only' not in str(caught.value)
    assert 'sensitive-value' not in str(caught.value)


def test_missing_configuration_and_invalid_schema(monkeypatch):
    for key in ('TLS_MCP_DB_NAME', 'TLS_MCP_DB_USER', 'TLS_MCP_DB_PASSWORD'):
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(InspectionError):
        Settings.from_env()
    monkeypatch.setenv('TLS_MCP_DB_NAME', 'thermal_label_studio')
    monkeypatch.setenv('TLS_MCP_DB_USER', 'reader')
    monkeypatch.setenv('TLS_MCP_DB_PASSWORD', 'test-only')
    monkeypatch.setenv('TLS_MCP_DB_SCHEMA', 'pg_catalog')
    with pytest.raises(InspectionError, match='application schema'):
        Settings.from_env()


def test_mcp_tools_and_annotations():
    import asyncio
    inspector, _, _ = inspector_with([])
    tools = asyncio.run(create_server(inspector).list_tools())
    assert {tool.name for tool in tools} == {'list_tables', 'describe_table', 'read_table'}
    assert all(tool.annotations.readOnlyHint and not tool.annotations.destructiveHint for tool in tools)
