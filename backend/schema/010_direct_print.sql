-- Additive, explicitly provisioned on the SAME database as the intake ledger.
-- No startup DDL. Back up and authorize the named target before applying.
BEGIN;
CREATE TABLE IF NOT EXISTS label_intake.printer_owners (
    destination varchar(96) PRIMARY KEY, owner uuid,
    held boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE label_intake.direct_print_jobs (
    job_id uuid PRIMARY KEY,
    account_id varchar(128) NOT NULL,
    kind varchar(16) NOT NULL CHECK (kind IN ('studio','label-print')),
    fingerprint char(64) NOT NULL,
    destination varchar(96) NOT NULL,
    payload_hashes jsonb NOT NULL,
    items jsonb NOT NULL,
    response jsonb,
    state varchar(16) NOT NULL CHECK (state IN ('PROCESSING','TERMINAL')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE label_intake.printer_safety_audit (
    sequence bigserial PRIMARY KEY, owner uuid NOT NULL,
    actor varchar(128) NOT NULL, action varchar(32) NOT NULL
        CHECK (action IN ('PHYSICAL_CHECK','RELEASE_HOLD','RECOVER_STOPPED_OWNER')),
    note varchar(1000) NOT NULL CHECK (length(btrim(note)) > 0),
    at timestamptz NOT NULL DEFAULT now()
);
-- Permanent identities cannot be reset by ordinary runtime deletion/update.
CREATE FUNCTION label_intake.protect_direct_print_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Direct print identity is permanent';
    END IF;
    IF (NEW.job_id,NEW.account_id,NEW.kind,NEW.fingerprint,NEW.destination,NEW.payload_hashes)
        IS DISTINCT FROM (OLD.job_id,OLD.account_id,OLD.kind,OLD.fingerprint,OLD.destination,OLD.payload_hashes)
        OR (OLD.state='TERMINAL' AND (NEW.state,NEW.items,NEW.response)
            IS DISTINCT FROM (OLD.state,OLD.items,OLD.response)) THEN
        RAISE EXCEPTION 'Direct print identity or terminal outcome cannot change';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER direct_print_job_identity BEFORE UPDATE OR DELETE ON label_intake.direct_print_jobs
    FOR EACH ROW EXECUTE FUNCTION label_intake.protect_direct_print_job();
REVOKE ALL ON label_intake.direct_print_jobs, label_intake.printer_safety_audit,
    label_intake.printer_owners FROM PUBLIC;
COMMIT;
