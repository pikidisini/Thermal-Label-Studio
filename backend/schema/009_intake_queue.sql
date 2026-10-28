-- Apply ONLY after backup and explicit authorization for a named target.
-- Additive migration: no startup DDL. Restore must leave control.paused = true.
BEGIN;
CREATE TABLE label_intake.queue_control (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    paused boolean NOT NULL DEFAULT true,
    max_pending integer NOT NULL DEFAULT 1000 CHECK (max_pending BETWEEN 1 AND 10000)
);
INSERT INTO label_intake.queue_control(singleton) VALUES (true);
CREATE TABLE label_intake.printer_owners (
    destination varchar(96) PRIMARY KEY,
    owner uuid,
    held boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE label_intake.queue (
    ledger_id uuid PRIMARY KEY REFERENCES label_intake.requests(ledger_id),
    sequence bigserial UNIQUE,
    request_id varchar(128) NOT NULL,
    sender varchar(128) NOT NULL,
    target_id varchar(128) NOT NULL,
    destination varchar(96) NOT NULL,
    mode varchar(10) NOT NULL CHECK (mode IN ('simulation','print')),
    state varchar(16) NOT NULL CHECK (state IN ('QUEUED','PROCESSING','TERMINAL','EXPIRED')),
    ciphertext bytea,
    key_version varchar(128) NOT NULL,
    credential_digest bytea NOT NULL CHECK (octet_length(credential_digest) = 32),
    policy_revision varchar(128) NOT NULL,
    worker_id varchar(128),
    started_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    UNIQUE(sender, request_id),
    CHECK (ciphertext IS NULL OR octet_length(ciphertext) <= 3145728),
    CHECK (state NOT IN ('TERMINAL','EXPIRED') OR ciphertext IS NULL)
);
CREATE INDEX queue_pick ON label_intake.queue(sequence) WHERE state = 'QUEUED';
CREATE TABLE label_intake.queue_workers (
    worker_id varchar(128) PRIMARY KEY,
    heartbeat timestamptz NOT NULL,
    current_job uuid
);
CREATE TABLE label_intake.queue_audit (
    sequence bigserial PRIMARY KEY,
    ledger_id uuid REFERENCES label_intake.requests(ledger_id),
    printer_owner uuid,
    actor varchar(128) NOT NULL,
    action varchar(40) NOT NULL,
    note varchar(1000) NOT NULL CHECK (length(btrim(note)) > 0),
    at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON label_intake.queue_control, label_intake.printer_owners,
    label_intake.queue, label_intake.queue_workers, label_intake.queue_audit FROM PUBLIC;
COMMIT;
