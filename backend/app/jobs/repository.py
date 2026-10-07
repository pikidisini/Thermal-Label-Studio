"""PostgreSQL jobs using one injected, idle, non-autocommit DB-API connection.

Each call owns its transaction. Do not share this connection concurrently or
with unrelated work. No driver, connection creation, or HTTP wiring is present.
"""

from datetime import datetime, timezone
from typing import Literal
from types import MappingProxyType
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.labels.models import LabelProcessRequest


State = Literal["RECEIVED", "PROCESSING", "SIMULATED", "SUBMITTED", "FAILED"]
ErrorCode = Literal[
    "unknown_label_code", "invalid_template_or_facts", "raster_failed", "processing_failed"
]
ERROR_MESSAGES = MappingProxyType({
    "unknown_label_code": "No active layout is registered for this label_code.",
    "invalid_template_or_facts": "The layout template, media, or required facts are invalid.",
    "raster_failed": "The bitmap could not be created.",
    "processing_failed": "Label processing failed.",
})


class JobError(ValueError):
    """Bounded public repository failure; never contains driver details."""


class JobConflict(JobError):
    """Missing job, duplicate identity, or stale conditional transition."""


class Job(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)

    job_id: UUID
    label_code: str = Field(min_length=1, max_length=128)
    mode: Literal["simulation", "print"]
    item_count: int = Field(ge=1, le=100)
    created_at: datetime
    updated_at: datetime
    state: State
    revision: int = Field(ge=0, le=2)
    error_code: ErrorCode | None = None
    error_message: str | None = None

    @model_validator(mode="after")
    def consistent(self):
        if not self.label_code.strip() or self.job_id.version != 4:
            raise ValueError("Invalid identity.")
        if any(t.tzinfo is None or t.utcoffset() is None for t in (self.created_at, self.updated_at)):
            raise ValueError("Timezone required.")
        if self.updated_at < self.created_at:
            raise ValueError("Invalid timestamps.")
        if (self.state == "RECEIVED" and self.revision != 0) or (
            self.state == "PROCESSING" and self.revision != 1
        ) or (self.state in ("SIMULATED", "SUBMITTED") and self.revision != 2) or (
            self.state == "FAILED" and self.revision not in (1, 2)
        ):
            raise ValueError("Invalid revision.")
        if self.state == "SIMULATED" and self.mode != "simulation" or self.state == "SUBMITTED" and self.mode != "print":
            raise ValueError("Invalid output mode.")
        if self.state == "FAILED":
            if self.error_code is None or self.error_message != ERROR_MESSAGES[self.error_code]:
                raise ValueError("Invalid error.")
        elif self.error_code is not None or self.error_message is not None:
            raise ValueError("Unexpected error.")
        return self


class JobEvent(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)
    job_id: UUID
    revision: int
    state: State
    occurred_at: datetime
    error_code: ErrorCode | None
    error_message: str | None


_COLUMNS = "job_id, label_code, mode, item_count, created_at, updated_at, state, revision, error_code, error_message"
INSERT_JOB = f"""INSERT INTO label_backend.jobs ({_COLUMNS})
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (job_id) DO NOTHING RETURNING {_COLUMNS}"""
SELECT_JOB = f"SELECT {_COLUMNS} FROM label_backend.jobs WHERE job_id = %s"
UPDATE_JOB = f"""UPDATE label_backend.jobs
SET state = %s, revision = revision + 1, updated_at = %s, error_code = %s, error_message = %s
WHERE job_id = %s AND state = %s AND revision = %s AND mode = %s
RETURNING {_COLUMNS}"""
INSERT_EVENT = """INSERT INTO label_backend.job_events
(job_id, revision, state, occurred_at, error_code, error_message)
VALUES (%s, %s, %s, %s, %s, %s)"""
SELECT_EVENTS = """SELECT job_id, revision, state, occurred_at, error_code, error_message
FROM label_backend.job_events WHERE job_id = %s ORDER BY revision LIMIT 4"""


def _map_job(row):
    if not isinstance(row, (tuple, list)) or len(row) != 10:
        raise JobError("Stored job is invalid.")
    values = dict(zip(_COLUMNS.split(", "), row))
    if isinstance(values["job_id"], str):
        values["job_id"] = UUID(values["job_id"])
    return Job.model_validate(values)


class JobRepository:
    def __init__(self, connection):
        if getattr(connection, "autocommit", None) is not False:
            raise JobError("A non-autocommit connection is required.")
        self.connection = connection

    def _transaction(self, action):
        cursor = None
        try:
            if self.connection.autocommit is not False:
                raise JobError("A non-autocommit connection is required.")
            cursor = self.connection.cursor()
            result = action(cursor)
            cursor.close()
            cursor = None
            self.connection.commit()
            return result
        except Exception as exc:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
            try:
                self.connection.rollback()
            except Exception:
                raise JobError("Job transaction rollback failed; discard the connection.") from None
            if isinstance(exc, JobError):
                raise exc from None
            raise JobError("Job persistence failed.") from None

    @staticmethod
    def _event(cursor, job):
        cursor.execute(INSERT_EVENT, (job.job_id, job.revision, job.state,
                                     job.updated_at, job.error_code, job.error_message))

    def create(self, request: LabelProcessRequest) -> Job:
        try:
            request = LabelProcessRequest.model_validate(request.model_dump(warnings=False))
            if not request.items:
                raise ValueError("Empty request.")
        except (ValidationError, AttributeError, TypeError, ValueError):
            raise JobError("A valid request with 1-100 items is required.") from None
        now = datetime.now(timezone.utc)
        job = Job(job_id=uuid4(), label_code=request.label_code, mode=request.mode,
                  item_count=len(request.items), created_at=now, updated_at=now,
                  state="RECEIVED", revision=0)

        def insert(cursor):
            cursor.execute(INSERT_JOB, tuple(getattr(job, name) for name in _COLUMNS.split(", ")))
            row = cursor.fetchone()
            if row is None:
                raise JobConflict("Job identity already exists.")
            stored = _map_job(row)
            if stored != job:
                raise JobError("Stored job is invalid.")
            self._event(cursor, stored)
            return stored
        return self._transaction(insert)

    def get(self, job_id: UUID) -> Job:
        if type(job_id) is not UUID or job_id.version != 4:
            raise JobError("A valid server job identity is required.")

        def read(cursor):
            cursor.execute(SELECT_JOB, (job_id,))
            row = cursor.fetchone()
            if row is None:
                raise JobConflict("Job does not exist.")
            job = _map_job(row)
            if job.job_id != job_id:
                raise JobError("Stored job is invalid.")
            return job
        return self._transaction(read)

    def transition(self, expected: Job, state: State, *, error_code: ErrorCode | None = None) -> Job:
        try:
            expected = Job.model_validate(expected.model_dump())
            allowed = {"RECEIVED": {"PROCESSING", "FAILED"},
                       "PROCESSING": {"SIMULATED" if expected.mode == "simulation" else "SUBMITTED", "FAILED"}}
            if state not in allowed.get(expected.state, set()):
                raise ValueError("Illegal transition.")
            message = ERROR_MESSAGES[error_code] if state == "FAILED" else None
            if state != "FAILED" and error_code is not None:
                raise ValueError("Unexpected error.")
            updated = Job.model_validate({**expected.model_dump(), "state": state,
                "revision": expected.revision + 1,
                "updated_at": max(datetime.now(timezone.utc), expected.updated_at),
                "error_code": error_code, "error_message": message})
        except (ValidationError, AttributeError, TypeError, ValueError, KeyError):
            raise JobError("Invalid job transition or error code.") from None

        def update(cursor):
            cursor.execute(UPDATE_JOB, (state, updated.updated_at, error_code, message,
                expected.job_id, expected.state, expected.revision, expected.mode))
            row = cursor.fetchone()
            if row is None:
                raise JobConflict("Job transition conflicted with stored state.")
            stored = _map_job(row)
            if stored != updated:
                raise JobError("Stored job is invalid.")
            self._event(cursor, stored)
            return stored
        return self._transaction(update)

    def events(self, job_id: UUID) -> tuple[JobEvent, ...]:
        if type(job_id) is not UUID or job_id.version != 4:
            raise JobError("A valid server job identity is required.")

        def read(cursor):
            cursor.execute(SELECT_EVENTS, (job_id,))
            rows = cursor.fetchall()
            if not 1 <= len(rows) <= 3:
                raise JobError("Stored job history is invalid.")
            events = []
            previous = None
            for index, row in enumerate(rows):
                if not isinstance(row, (tuple, list)) or len(row) != 6:
                    raise JobError("Stored job history is invalid.")
                identity = UUID(row[0]) if isinstance(row[0], str) else row[0]
                event = JobEvent(job_id=identity, revision=row[1], state=row[2],
                    occurred_at=row[3], error_code=row[4], error_message=row[5])
                if identity != job_id or event.revision != index or event.occurred_at.tzinfo is None:
                    raise JobError("Stored job history is invalid.")
                if index == 0 and event.state != "RECEIVED" or previous and (
                    previous.state not in ("RECEIVED", "PROCESSING")
                    or event.state not in ({"PROCESSING", "FAILED"} if previous.state == "RECEIVED"
                                           else {"SIMULATED", "SUBMITTED", "FAILED"})
                    or event.occurred_at < previous.occurred_at
                ):
                    raise JobError("Stored job history is invalid.")
                if event.state == "FAILED":
                    if event.error_code is None or event.error_message != ERROR_MESSAGES[event.error_code]:
                        raise JobError("Stored job history is invalid.")
                elif event.error_code is not None or event.error_message is not None:
                    raise JobError("Stored job history is invalid.")
                events.append(event)
                previous = event
            return tuple(events)
        return self._transaction(read)
