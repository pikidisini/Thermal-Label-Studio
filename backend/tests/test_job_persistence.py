import builtins
from datetime import datetime, timezone
from pathlib import Path
import socket
import subprocess
from uuid import UUID, uuid4

import pytest

from app.jobs import repository as module
from app.jobs.repository import Job, JobConflict, JobError, JobRepository
from app.labels.models import LabelProcessRequest


class FakeConnection:
    autocommit = False

    def __init__(self, *, fail=None):
        self.calls = []
        self.job = None
        self.history = []
        self.pending_job = None
        self.pending_history = []
        self.fail = fail
        self.override = None
        self.conflict = False

    def step(self, name):
        self.calls.append(name)
        if name == self.fail:
            raise RuntimeError('SECRET raw facts bitmap password')

    def cursor(self):
        self.step('cursor')
        return FakeCursor(self)

    def commit(self):
        self.step('commit')
        self.job = self.pending_job
        self.history = list(self.pending_history)

    def rollback(self):
        self.step('rollback')
        self.pending_job = self.job
        self.pending_history = list(self.history)


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None

    def execute(self, sql, params):
        c = self.connection
        c.calls.append((sql, params))
        c.step('event' if sql == module.INSERT_EVENT else 'execute')
        if sql == module.INSERT_JOB:
            self.row = None if c.job is not None or c.conflict else params
            if self.row:
                c.pending_job = self.row
        elif sql == module.UPDATE_JOB:
            state, timestamp, code, message, identity, expected, revision, mode = params
            old = c.job
            if old is None or c.conflict or (old[0], old[6], old[7], old[2]) != (identity, expected, revision, mode):
                self.row = None
            else:
                self.row = (*old[:5], timestamp, state, revision + 1, code, message)
                c.pending_job = self.row
        elif sql == module.SELECT_JOB:
            self.row = c.job if c.job and c.job[0] == params[0] else None
        elif sql == module.INSERT_EVENT:
            c.pending_history.append(params)
        elif sql == module.SELECT_EVENTS:
            self.row = [row for row in c.history if row[0] == params[0]][:4]
        else:
            pytest.fail('Unexpected SQL')

    def fetchone(self):
        self.connection.step('fetch')
        return self.connection.override if self.connection.override is not None else self.row

    def fetchall(self):
        self.connection.step('fetch')
        return self.connection.override if self.connection.override is not None else self.row

    def close(self):
        self.connection.step('close')


def request(mode='simulation'):
    return LabelProcessRequest(label_code="roll_80x200", mode=mode,
        items=[{'item_id': 'private-id', 'facts': {'batch': 'SECRET'}}])


@pytest.mark.parametrize('mode,terminal', [('simulation', 'SIMULATED'), ('print', 'SUBMITTED')])
def test_lifecycle_atomic_sql_metadata_and_history(mode, terminal):
    c = FakeConnection()
    repo = JobRepository(c)
    initial = repo.create(request(mode))
    assert initial.job_id.version == 4
    assert initial.item_count == 1 and initial.revision == 0
    assert initial.created_at.utcoffset().total_seconds() == 0
    first_calls = list(c.calls)
    assert [x for x in first_calls if isinstance(x, str)] == ['cursor', 'execute', 'fetch', 'event', 'close', 'commit']
    assert first_calls[1][0] == module.INSERT_JOB
    assert first_calls[4][0] == module.INSERT_EVENT
    assert 'SECRET' not in repr(c.calls) and 'private-id' not in repr(c.calls)
    processing = repo.transition(initial, 'PROCESSING')
    completed = repo.transition(processing, terminal)
    assert completed.job_id == initial.job_id and completed.created_at == initial.created_at
    assert repo.get(initial.job_id) == completed
    events = repo.events(initial.job_id)
    assert [e.state for e in events] == ['RECEIVED', 'PROCESSING', terminal]
    assert [e.revision for e in events] == [0, 1, 2]
    with pytest.raises(Exception):
        completed.state = 'FAILED'


@pytest.mark.parametrize('source', ['RECEIVED', 'PROCESSING'])
@pytest.mark.parametrize('code', list(module.ERROR_MESSAGES))
def test_failed_is_bounded_terminal(source, code):
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request())
    if source == 'PROCESSING':
        job = repo.transition(job, source)
    failed = repo.transition(job, 'FAILED', error_code=code)
    assert failed.error_message == module.ERROR_MESSAGES[code]
    assert repo.events(job.job_id)[-1].error_message == failed.error_message
    count = len(c.calls)
    with pytest.raises(JobError):
        repo.transition(failed, 'PROCESSING')
    assert len(c.calls) == count


@pytest.mark.parametrize('state,code', [('SIMULATED', None), ('SUBMITTED', None), ('RECEIVED', None),
    ('FAILED', None), ('FAILED', 'SECRET'), ('PROCESSING', 'processing_failed'), ('OTHER', None)])
def test_invalid_transition_before_sql(state, code):
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request())
    c.calls.clear()
    with pytest.raises(JobError, match='Invalid job transition'):
        repo.transition(job, state, error_code=code)
    assert c.calls == []


@pytest.mark.parametrize('mode,state', [('simulation', 'SUBMITTED'), ('print', 'SIMULATED')])
def test_wrong_sink_fails_before_sql(mode, state):
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.transition(repo.create(request(mode)), 'PROCESSING')
    c.calls.clear()
    with pytest.raises(JobError):
        repo.transition(job, state)
    assert c.calls == []


def test_duplicate_server_identity_and_stale_transition_roll_back(monkeypatch):
    identity = uuid4()
    monkeypatch.setattr(module, 'uuid4', lambda: identity)
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request())
    with pytest.raises(JobConflict, match='already exists'):
        repo.create(request())
    assert len(c.history) == 1 and c.calls[-1] == 'rollback'
    repo.transition(job, 'PROCESSING')
    with pytest.raises(JobConflict):
        repo.transition(job, 'PROCESSING')
    assert len(c.history) == 2 and c.job[6] == 'PROCESSING'


@pytest.mark.parametrize('operation', ['create', 'transition', 'get', 'events'])
@pytest.mark.parametrize('failure', ['cursor', 'execute', 'fetch', 'close', 'commit'])
def test_transaction_failures_rollback_without_raw_details(operation, failure):
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request()) if operation != 'create' else None
    c.fail = failure
    action = {'create': lambda: repo.create(request()),
              'transition': lambda: repo.transition(job, 'PROCESSING'),
              'get': lambda: repo.get(job.job_id), 'events': lambda: repo.events(job.job_id)}[operation]
    with pytest.raises(JobError) as caught:
        action()
    assert 'SECRET' not in str(caught.value)
    assert c.calls[-1] == 'rollback'
    assert failure in c.calls
    if operation == 'create':
        assert c.job is None and c.history == []
    else:
        assert c.job[6] == 'RECEIVED' and len(c.history) == 1


@pytest.mark.parametrize('operation', ['create', 'transition'])
def test_event_failure_rolls_back_job(operation):
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request()) if operation == 'transition' else None
    c.fail = 'event'
    with pytest.raises(JobError):
        repo.transition(job, 'PROCESSING') if job else repo.create(request())
    assert c.calls[-1] == 'rollback'
    assert (c.job is None) if job is None else c.job[6] == 'RECEIVED'


def test_rollback_failure_requires_discard():
    c = FakeConnection(fail='rollback')
    c.conflict = True
    with pytest.raises(JobError, match='discard the connection'):
        JobRepository(c).create(request())


@pytest.mark.parametrize('index,value', [(0, 'bad-uuid'), (1, ' '), (2, 'wrong'), (3, True),
    (3, 101), (4, datetime(2026, 1, 1)), (6, 'UNKNOWN'), (7, 2), (8, 'SECRET'), (9, 'SECRET')])
def test_corrupt_rows_fail_closed(index, value):
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request())
    row = list(c.job)
    row[index] = value
    c.override = row
    with pytest.raises(JobError):
        repo.get(job.job_id)
    assert c.calls[-1] == 'rollback'


@pytest.mark.parametrize('row', [(), ('SECRET',), {}, None])
def test_missing_or_wrong_row_shape(row):
    c = FakeConnection()
    repo = JobRepository(c)
    identity = uuid4()
    c.override = row
    with pytest.raises(JobError):
        repo.get(identity)


def test_uuid_string_mapping_and_history_rejection():
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request())
    c.override = (str(job.job_id), *c.job[1:])
    assert repo.get(job.job_id) == job
    for rows in [[], [c.history[0]] * 4, [(job.job_id, 1, 'PROCESSING', job.created_at, None, None)],
                 [(job.job_id, 0, 'RECEIVED', job.created_at, None, 'SECRET')]]:
        c.override = rows
        with pytest.raises(JobError):
            repo.events(job.job_id)


@pytest.mark.parametrize('autocommit', [True, None, 0])
def test_autocommit_rejected(autocommit):
    c = FakeConnection()
    c.autocommit = autocommit
    with pytest.raises(JobError):
        JobRepository(c)
    assert c.calls == []


def test_invalid_requests_and_identifiers_never_reach_sql():
    c = FakeConnection()
    repo = JobRepository(c)
    for value in [None, LabelProcessRequest(label_code='x', mode='simulation'),
                  LabelProcessRequest.model_construct(label_code=' ', mode='print', items=[])]:
        with pytest.raises(JobError):
            repo.create(value)
    for identity in [str(uuid4()), 'SECRET', UUID(int=0), None]:
        with pytest.raises(JobError):
            repo.get(identity)
        with pytest.raises(JobError):
            repo.events(identity)
    assert c.calls == []


def test_no_filesystem_network_or_process_effects(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail('Repository attempted an external effect')
    monkeypatch.setattr(builtins, 'open', forbidden)
    monkeypatch.setattr(Path, 'open', forbidden)
    monkeypatch.setattr(socket.socket, 'connect', forbidden)
    monkeypatch.setattr(socket.socket, 'connect_ex', forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    monkeypatch.setattr(subprocess, 'Popen', forbidden)
    c = FakeConnection()
    repo = JobRepository(c)
    job = repo.create(request())
    processing = repo.transition(job, 'PROCESSING')
    repo.transition(processing, 'SIMULATED')
    repo.get(job.job_id)
    repo.events(job.job_id)


def test_schema_and_sql_contract():
    sql = (Path(__file__).parents[1] / 'schema' / '001_jobs.sql').read_text()
    assert sql.startswith('-- Fresh application schema')
    assert 'BEGIN;' in sql and sql.endswith('COMMIT;\n')
    for text in ['PRIMARY KEY (job_id, revision)', 'REFERENCES label_backend.jobs(job_id)',
                 'Job history is append only', 'IS DISTINCT FROM ROW(OLD.job_id',
                 'DEFERRABLE INITIALLY DEFERRED', 'Job event is required',
                 "mode = 'simulation'", "mode = 'print'", 'item_count BETWEEN 1 AND 100']:
        assert text in sql
    assert 'CREATE TABLE IF NOT EXISTS' not in sql and 'DROP ' not in sql
    assert 'facts json' not in sql and 'bitmap bytea' not in sql
    assert 'AND state = %s AND revision = %s AND mode = %s' in module.UPDATE_JOB
    assert 'ON CONFLICT (job_id) DO NOTHING RETURNING' in module.INSERT_JOB
    assert 'ORDER BY revision LIMIT 4' in module.SELECT_EVENTS
