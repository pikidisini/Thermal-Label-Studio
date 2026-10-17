-- REVIEW ONLY. Apply only to an explicitly authorized named PostgreSQL target.
-- No application startup or task script executes this schema.
BEGIN;
CREATE SCHEMA label_intake;
CREATE TABLE label_intake.capacity (
    singleton integer PRIMARY KEY CHECK (singleton = 1),
    identities bigint NOT NULL CHECK (identities BETWEEN 0 AND 1000000)
);
INSERT INTO label_intake.capacity VALUES (1, 0);
CREATE TABLE label_intake.key_versions (
    key_version varchar(128) PRIMARY KEY,
    key_check char(64) NOT NULL CHECK (key_check ~ '^[0-9a-f]{64}$')
);
CREATE TABLE label_intake.requests (
    ledger_id uuid PRIMARY KEY,
    sender varchar(128) NOT NULL,
    key_version varchar(128) NOT NULL,
    identity_hmac char(64) NOT NULL CHECK (identity_hmac ~ '^[0-9a-f]{64}$'),
    payload_hmac char(64) NOT NULL CHECK (payload_hmac ~ '^[0-9a-f]{64}$'),
    owner_token uuid NOT NULL,
    original_trace_id uuid NOT NULL,
    mode varchar(10) NOT NULL CHECK (mode IN ('simulation','print')),
    state varchar(16) NOT NULL CHECK (state IN ('RECEIVED','TERMINAL','EXPIRED')),
    outcome varchar(16) CHECK (outcome IN ('COMPLETED','PARTIAL','FAILED','UNCERTAIN')),
    created_at double precision NOT NULL,
    expires_at double precision NOT NULL CHECK (expires_at >= created_at),
    metadata jsonb,
    UNIQUE (sender, key_version, identity_hmac),
    CHECK (metadata IS NULL OR octet_length(metadata::text) <= 131072)
);
CREATE TABLE label_intake.items (
    ledger_id uuid NOT NULL REFERENCES label_intake.requests(ledger_id),
    item_index integer NOT NULL CHECK (item_index BETWEEN 0 AND 99),
    state varchar(16) NOT NULL CHECK (state IN
      ('RECEIVED','PREPARED','SEND_CLAIMED','SIMULATED','SUBMITTED','UNCERTAIN','FAILED','SKIPPED')),
    metadata jsonb NOT NULL CHECK (octet_length(metadata::text) <= 4096),
    PRIMARY KEY (ledger_id, item_index)
);
-- Protected simulation results only; never store print PNG, IPL or raw data.
CREATE TABLE label_intake.simulation_results (
    ledger_id uuid PRIMARY KEY REFERENCES label_intake.requests(ledger_id),
    response jsonb NOT NULL CHECK (octet_length(response::text) <= 12582912)
);
REVOKE ALL ON SCHEMA label_intake FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA label_intake FROM PUBLIC;
COMMIT;
