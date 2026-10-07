-- Fresh application schema only. Review and authorize the named DB separately.
-- No IF NOT EXISTS: existing names stop deployment instead of hiding drift.
BEGIN;
CREATE SCHEMA label_backend;
CREATE TABLE label_backend.jobs (
    job_id uuid PRIMARY KEY,
    label_code varchar(128) NOT NULL CHECK (length(btrim(label_code)) > 0),
    mode varchar(10) NOT NULL CHECK (mode IN ('simulation', 'print')),
    item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 100),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
    state varchar(10) NOT NULL CHECK (state IN ('RECEIVED', 'PROCESSING', 'SIMULATED', 'SUBMITTED', 'FAILED')),
    revision integer NOT NULL,
    error_code varchar(32),
    error_message varchar(128),
    CHECK ((state = 'RECEIVED' AND revision = 0)
        OR (state = 'PROCESSING' AND revision = 1)
        OR (state IN ('SIMULATED', 'SUBMITTED') AND revision = 2)
        OR (state = 'FAILED' AND revision IN (1, 2))),
    CHECK ((state <> 'SIMULATED' OR mode = 'simulation')
       AND (state <> 'SUBMITTED' OR mode = 'print')),
    CHECK ((state <> 'FAILED' AND error_code IS NULL AND error_message IS NULL)
        OR (state = 'FAILED' AND error_code IS NOT NULL AND error_message IS NOT NULL
        AND (error_code, error_message) IN (
            ('unknown_label_code', 'No active layout is registered for this label_code.'),
            ('invalid_template_or_facts', 'The layout template, media, or required facts are invalid.'),
            ('raster_failed', 'The bitmap could not be created.'),
            ('processing_failed', 'Label processing failed.'))))
);
CREATE TABLE label_backend.job_events (
    job_id uuid NOT NULL REFERENCES label_backend.jobs(job_id),
    revision integer NOT NULL CHECK (revision BETWEEN 0 AND 2),
    state varchar(10) NOT NULL,
    occurred_at timestamptz NOT NULL,
    error_code varchar(32),
    error_message varchar(128),
    PRIMARY KEY (job_id, revision)
);
CREATE FUNCTION label_backend.guard_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Job deletion is prohibited';
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.state <> 'RECEIVED' OR NEW.revision <> 0 OR NEW.updated_at <> NEW.created_at THEN
            RAISE EXCEPTION 'Invalid initial job';
        END IF;
    ELSE
        IF ROW(NEW.job_id, NEW.label_code, NEW.mode, NEW.item_count, NEW.created_at)
            IS DISTINCT FROM ROW(OLD.job_id, OLD.label_code, OLD.mode, OLD.item_count, OLD.created_at)
            OR NEW.revision <> OLD.revision + 1 OR NEW.updated_at < OLD.updated_at
            OR NOT ((OLD.state = 'RECEIVED' AND NEW.state IN ('PROCESSING', 'FAILED'))
                OR (OLD.state = 'PROCESSING' AND NEW.state IN ('SIMULATED', 'SUBMITTED', 'FAILED'))) THEN
            RAISE EXCEPTION 'Invalid job transition';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_job BEFORE INSERT OR UPDATE OR DELETE ON label_backend.jobs
FOR EACH ROW EXECUTE FUNCTION label_backend.guard_job();
CREATE FUNCTION label_backend.guard_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_job label_backend.jobs%ROWTYPE;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Job history is append only';
    END IF;
    SELECT * INTO STRICT current_job FROM label_backend.jobs WHERE job_id = NEW.job_id;
    IF ROW(NEW.revision, NEW.state, NEW.occurred_at, NEW.error_code, NEW.error_message)
        IS DISTINCT FROM ROW(current_job.revision, current_job.state, current_job.updated_at,
                             current_job.error_code, current_job.error_message) THEN
        RAISE EXCEPTION 'Event does not match job';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_event BEFORE INSERT OR UPDATE OR DELETE ON label_backend.job_events
FOR EACH ROW EXECUTE FUNCTION label_backend.guard_event();
-- Deferred check makes a missing event abort the transaction even for direct SQL.
CREATE FUNCTION label_backend.require_job_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM label_backend.job_events
        WHERE job_id = NEW.job_id AND revision = NEW.revision AND state = NEW.state
          AND occurred_at = NEW.updated_at
          AND error_code IS NOT DISTINCT FROM NEW.error_code
          AND error_message IS NOT DISTINCT FROM NEW.error_message) THEN
        RAISE EXCEPTION 'Job event is required';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER require_job_event AFTER INSERT OR UPDATE ON label_backend.jobs
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION label_backend.require_job_event();
CREATE FUNCTION label_backend.deny_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Job audit truncation is prohibited';
END;
$$;
CREATE TRIGGER deny_job_truncate BEFORE TRUNCATE ON label_backend.jobs
FOR EACH STATEMENT EXECUTE FUNCTION label_backend.deny_truncate();
CREATE TRIGGER deny_event_truncate BEFORE TRUNCATE ON label_backend.job_events
FOR EACH STATEMENT EXECUTE FUNCTION label_backend.deny_truncate();
COMMIT;
