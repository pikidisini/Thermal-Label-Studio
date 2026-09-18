-- Thermal Label Studio - Print Pipeline PostgreSQL Schema v1
-- Target: PostgreSQL 15+ (PROPOSED; runtime-verified on disposable PostgreSQL 15.13)
-- This forward migration is fail-fast by design. Syntax and validation harness
-- have been verified against disposable PostgreSQL 15.13 (forward DDL, 33 negative
-- test cases, rollback, and clean re-apply). It is not yet production-deployed,
-- and all architectural decisions remain PROPOSED (not yet ACCEPTED).

-- 1. Media profiles and immutable version rows
CREATE TABLE media_profiles (
    media_profile_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media_profile_versions (
    media_profile_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_profile_id VARCHAR(64) NOT NULL REFERENCES media_profiles(media_profile_id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    width_mm NUMERIC(6, 2) NOT NULL CHECK (width_mm > 0),
    height_mm NUMERIC(6, 2) NOT NULL CHECK (height_mm > 0),
    material_type TEXT NOT NULL CHECK (material_type IN ('paper', 'synthetic', 'textile')),
    sensor_mode TEXT NOT NULL CHECK (sensor_mode IN ('gap', 'black_mark', 'continuous', 'notch')),
    orientation TEXT NOT NULL CHECK (orientation IN ('portrait', 'landscape')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_media_profile_versions_version UNIQUE (media_profile_id, version)
);

-- 2. Template versions retain an opaque, immutable content reference.
CREATE TABLE template_versions (
    template_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    svg_payload_ref VARCHAR(128) NOT NULL UNIQUE
        CHECK (svg_payload_ref ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
    svg_content_sha256 CHAR(64) NOT NULL CHECK (svg_content_sha256 ~ '^[a-f0-9]{64}$'),
    width_mm NUMERIC(6, 2) NOT NULL CHECK (width_mm > 0),
    height_mm NUMERIC(6, 2) NOT NULL CHECK (height_mm > 0),
    orientation TEXT NOT NULL CHECK (orientation IN ('portrait', 'landscape')),
    asset_font_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    renderer_compatibility JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_template_versions_version UNIQUE (template_id, version)
);

-- 3. Trusted printer registry. Endpoint values are never accepted from SAP.
CREATE TABLE printer_registry (
    printer_id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    area_id VARCHAR(64) NOT NULL,
    brand TEXT NOT NULL CHECK (brand IN ('HONEYWELL', 'INTERMEC', 'ZEBRA')),
    model VARCHAR(64) NOT NULL,
    delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('central_tcp', 'gateway_agent', 'legacy_bridge')),
    configured_media_profile_version_id UUID NOT NULL REFERENCES media_profile_versions(media_profile_version_id) ON DELETE RESTRICT,
    network_host INET NULL,
    network_port INTEGER NULL CHECK (network_port BETWEEN 1 AND 65535),
    gateway_executor_id VARCHAR(64) NULL,
    trusted_bridge_id VARCHAR(64) NULL,
    printer_language TEXT NOT NULL CHECK (printer_language IN ('ipl', 'zpl')),
    emulation TEXT NOT NULL CHECK (emulation IN ('native', 'zsim2')),
    confirmed_dpi INTEGER NOT NULL CHECK (confirmed_dpi > 0),
    firmware_version VARCHAR(64) NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_printer_registry_language_emulation CHECK (
        (printer_language = 'ipl' AND emulation = 'native') OR
        (printer_language = 'zpl' AND emulation IN ('native', 'zsim2'))
    ),
    CONSTRAINT chk_printer_registry_delivery_endpoint CHECK (
        (delivery_mode = 'central_tcp' AND network_host IS NOT NULL AND network_port IS NOT NULL
            AND gateway_executor_id IS NULL AND trusted_bridge_id IS NULL) OR
        (delivery_mode = 'gateway_agent' AND network_host IS NULL AND network_port IS NULL
            AND gateway_executor_id IS NOT NULL AND trusted_bridge_id IS NULL) OR
        (delivery_mode = 'legacy_bridge' AND network_host IS NULL AND network_port IS NULL
            AND gateway_executor_id IS NULL AND trusted_bridge_id IS NOT NULL)
    )
);

-- 4. One active batch owner per printer. fencing_generation monotonicity is a
-- repository/transaction rule; a CHECK can only enforce positivity.
CREATE TABLE printer_dispatch_state (
    printer_id VARCHAR(64) PRIMARY KEY REFERENCES printer_registry(printer_id) ON DELETE RESTRICT,
    active_batch_id UUID NULL,
    executor_type TEXT NULL CHECK (executor_type IN ('central_dispatcher', 'gateway_agent', 'local_agent')),
    executor_id VARCHAR(64) NULL,
    fencing_generation BIGINT NOT NULL DEFAULT 1 CHECK (fencing_generation > 0),
    acquired_at TIMESTAMPTZ NULL,
    lease_expires_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_dispatch_state_fields CHECK (
        (active_batch_id IS NULL AND executor_type IS NULL AND executor_id IS NULL
            AND acquired_at IS NULL AND lease_expires_at IS NULL) OR
        (active_batch_id IS NOT NULL AND executor_type IS NOT NULL AND executor_id IS NOT NULL
            AND acquired_at IS NOT NULL AND lease_expires_at IS NOT NULL
            AND lease_expires_at > acquired_at)
    )
);

-- 5. Batch root. The composite unique key binds a batch to its printer.
CREATE TABLE print_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producer_namespace VARCHAR(64) NOT NULL,
    request_id VARCHAR(128) NOT NULL,
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_contract_sha256 CHAR(64) NOT NULL CHECK (raw_contract_sha256 ~ '^[a-f0-9]{64}$'),
    canonical_payload_snapshot JSONB NOT NULL,
    printer_id VARCHAR(64) NOT NULL REFERENCES printer_registry(printer_id) ON DELETE RESTRICT,
    configured_media_profile_version_id UUID NOT NULL REFERENCES media_profile_versions(media_profile_version_id) ON DELETE RESTRICT,
    printer_capability_snapshot JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'processing', 'completed', 'partially_failed', 'paused', 'cancelled')),
    total_items INTEGER NOT NULL CHECK (total_items > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_print_batches_producer_request UNIQUE (producer_namespace, request_id),
    CONSTRAINT uq_print_batches_batch_printer UNIQUE (batch_id, printer_id),
    CONSTRAINT chk_print_batches_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);

ALTER TABLE printer_dispatch_state
    ADD CONSTRAINT fk_dispatch_active_batch_printer
    FOREIGN KEY (active_batch_id, printer_id)
    REFERENCES print_batches(batch_id, printer_id) ON DELETE RESTRICT;

-- 6. Items retain batch membership and sequence.
CREATE TABLE print_batch_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES print_batches(batch_id) ON DELETE RESTRICT,
    item_sequence INTEGER NOT NULL CHECK (item_sequence > 0),
    template_version_id UUID NOT NULL REFERENCES template_versions(template_version_id) ON DELETE RESTRICT,
    canonical_item_data JSONB NOT NULL,
    item_data_sha256 CHAR(64) NOT NULL CHECK (item_data_sha256 ~ '^[a-f0-9]{64}$'),
    copies INTEGER NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 100),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'rendered', 'dispatching', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_print_batch_items_sequence UNIQUE (batch_id, item_sequence),
    CONSTRAINT uq_print_batch_items_item_batch UNIQUE (item_id, batch_id)
);

-- 7. Jobs redundantly store printer_id for query efficiency, but both composite
-- foreign keys prevent divergence from the batch and item.
CREATE TABLE print_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL,
    item_id UUID NOT NULL,
    printer_id VARCHAR(64) NOT NULL,
    job_kind TEXT NOT NULL CHECK (job_kind IN ('original', 'reprint')),
    reprint_of_job_id UUID NULL,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'rendered', 'queued', 'claimed', 'sending', 'sent_to_printer', 'delivery_unknown', 'failed', 'expired', 'cancelled')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    executor_type TEXT NULL CHECK (executor_type IN ('central_dispatcher', 'gateway_agent', 'local_agent')),
    executor_id VARCHAR(64) NULL,
    claimed_at TIMESTAMPTZ NULL,
    lease_expires_at TIMESTAMPTZ NULL,
    fencing_token BIGINT NULL CHECK (fencing_token > 0),
    bytes_sent INTEGER NOT NULL DEFAULT 0 CHECK (bytes_sent >= 0),
    last_error_code VARCHAR(64) NULL,
    last_error_category VARCHAR(64) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_print_jobs_job_item UNIQUE (job_id, item_id),
    CONSTRAINT fk_print_jobs_item_batch FOREIGN KEY (item_id, batch_id)
        REFERENCES print_batch_items(item_id, batch_id) ON DELETE RESTRICT,
    CONSTRAINT fk_print_jobs_batch_printer FOREIGN KEY (batch_id, printer_id)
        REFERENCES print_batches(batch_id, printer_id) ON DELETE RESTRICT,
    CONSTRAINT fk_print_jobs_reprint_parent FOREIGN KEY (reprint_of_job_id, item_id)
        REFERENCES print_jobs(job_id, item_id) ON DELETE RESTRICT,
    CONSTRAINT chk_print_jobs_reprint_semantics CHECK (
        (job_kind = 'original' AND reprint_of_job_id IS NULL) OR
        (job_kind = 'reprint' AND reprint_of_job_id IS NOT NULL)
    ),
    CONSTRAINT chk_print_jobs_no_self_reprint CHECK (reprint_of_job_id IS NULL OR reprint_of_job_id <> job_id),
    CONSTRAINT chk_print_jobs_expiry CHECK (expires_at > created_at),
    CONSTRAINT chk_print_jobs_claim_fields CHECK (
        (status IN ('accepted', 'rendered', 'queued') AND executor_type IS NULL AND executor_id IS NULL
            AND claimed_at IS NULL AND lease_expires_at IS NULL AND fencing_token IS NULL) OR
        (status IN ('claimed', 'sending', 'sent_to_printer', 'delivery_unknown')
            AND executor_type IS NOT NULL AND executor_id IS NOT NULL AND claimed_at IS NOT NULL
            AND lease_expires_at IS NOT NULL AND fencing_token IS NOT NULL) OR
        (status IN ('failed', 'expired', 'cancelled') AND
            ((executor_type IS NULL AND executor_id IS NULL AND claimed_at IS NULL
                AND lease_expires_at IS NULL AND fencing_token IS NULL) OR
             (executor_type IS NOT NULL AND executor_id IS NOT NULL AND claimed_at IS NOT NULL
                AND lease_expires_at IS NOT NULL AND fencing_token IS NOT NULL)))
    ),
    CONSTRAINT chk_print_jobs_lease_order CHECK (
        claimed_at IS NULL OR lease_expires_at IS NULL OR lease_expires_at > claimed_at
    ),
    CONSTRAINT chk_print_jobs_delivery_attempt CHECK (
        status NOT IN ('sending', 'sent_to_printer', 'delivery_unknown') OR attempt_count >= 1
    )
);

-- At most one original per item. Minimum one original is an ingestion
-- transaction/repository rule and is not guaranteed by this partial index.
CREATE UNIQUE INDEX uq_print_jobs_single_original_per_item
    ON print_jobs (item_id) WHERE job_kind = 'original';

-- Reprint policy: a reprint is a new row. The service must require its parent
-- to be an original root and store that root job_id; FK alone cannot prevent
-- a multi-row chain or every possible cycle.

-- 8. Artifact metadata. Binary content is outside PostgreSQL and is addressed
-- only by the opaque payload_ref.
CREATE TABLE print_artifacts (
    artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES print_jobs(job_id) ON DELETE RESTRICT,
    payload_ref VARCHAR(128) NOT NULL UNIQUE,
    filename VARCHAR(64) NOT NULL CHECK (filename IN ('label.ipl', 'label.zpl')),
    media_type VARCHAR(64) NOT NULL,
    byte_length INTEGER NOT NULL,
    artifact_sha256 CHAR(64) NOT NULL,
    printer_language_snapshot TEXT NOT NULL CHECK (printer_language_snapshot IN ('ipl', 'zpl')),
    renderer_version VARCHAR(64) NOT NULL,
    render_config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    template_version_id UUID NOT NULL REFERENCES template_versions(template_version_id) ON DELETE RESTRICT,
    printer_capability_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retention_expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_print_artifacts_filename_language CHECK (
        (printer_language_snapshot = 'ipl' AND filename = 'label.ipl') OR
        (printer_language_snapshot = 'zpl' AND filename = 'label.zpl')
    ),
    CONSTRAINT chk_print_artifacts_payload_ref CHECK (
        payload_ref ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    ),
    CONSTRAINT chk_print_artifacts_media_type CHECK (
        media_type = 'application/octet-stream'
    ),
    CONSTRAINT chk_print_artifacts_byte_length CHECK (
        byte_length BETWEEN 1 AND 10485760
    ),
    CONSTRAINT chk_print_artifacts_checksum CHECK (
        artifact_sha256 ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT chk_print_artifacts_retention CHECK (retention_expires_at > created_at)
);

-- Accepted jobs have no artifact; rendered and later artifact-bearing states
-- require one by ingestion/render service transaction (a cross-table CHECK is
-- not available here). Historical metadata remains after binary retention.

-- 9. Transactional outbox.
CREATE TABLE print_job_outbox (
    outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    deduplication_key VARCHAR(128) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_by VARCHAR(64) NULL,
    claimed_at TIMESTAMPTZ NULL,
    claim_expires_at TIMESTAMPTZ NULL,
    published_at TIMESTAMPTZ NULL,
    last_error_code VARCHAR(64) NULL,
    last_error_category VARCHAR(64) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_outbox_state_fields CHECK (
        (status = 'pending' AND claimed_by IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL AND published_at IS NULL) OR
        (status = 'publishing' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL AND published_at IS NULL) OR
        (status = 'published' AND published_at IS NOT NULL AND claimed_by IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL) OR
        (status = 'failed' AND published_at IS NULL AND
            ((claimed_by IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL) OR
             (claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL)))
    ),
    CONSTRAINT chk_outbox_claim_order CHECK (claimed_at IS NULL OR claim_expires_at > claimed_at)
);

-- 10. Append-only audit ledger. Application roles receive SELECT/INSERT only;
-- table owners/DBA remain able to bypass ordinary role controls.
CREATE TABLE print_audit_events (
    audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'sap_producer', 'operator', 'admin', 'dispatcher', 'agent')),
    actor_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    reason_code VARCHAR(64) NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    correlation_id VARCHAR(128) NULL
);

CREATE FUNCTION fn_prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit mutation is not permitted'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'trg_protect_audit_events';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_audit_events
    BEFORE UPDATE OR DELETE ON print_audit_events
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_mutation();

-- 11. Query-path indexes. Polling orders pending work by availability, then
-- creation; no row lock is held while network I/O occurs.
CREATE INDEX idx_print_batches_status_created ON print_batches (status, created_at ASC);
CREATE INDEX idx_print_batch_items_batch_sequence ON print_batch_items (batch_id, item_sequence ASC);
CREATE INDEX idx_print_jobs_printer_status_created ON print_jobs (printer_id, status, created_at ASC);
CREATE INDEX idx_print_jobs_item_created ON print_jobs (item_id, created_at ASC);
CREATE INDEX idx_print_jobs_lease_expiry ON print_jobs (status, lease_expires_at) WHERE status IN ('claimed', 'sending');
CREATE INDEX idx_print_job_outbox_pending_available ON print_job_outbox (available_at ASC, created_at ASC) WHERE status = 'pending';
CREATE INDEX idx_print_artifacts_retention_expiry ON print_artifacts (retention_expires_at ASC);
CREATE INDEX idx_print_audit_events_aggregate_time ON print_audit_events (aggregate_type, aggregate_id, occurred_at ASC);
CREATE INDEX idx_print_audit_events_correlation ON print_audit_events (correlation_id) WHERE correlation_id IS NOT NULL;

-- 12. Role proposal only. No credential examples are included.
-- A dedicated application role should receive SELECT/INSERT/UPDATE only on
-- mutable operational tables and SELECT/INSERT on print_audit_events. It must
-- receive no UPDATE/DELETE on media_profile_versions, template_versions, or
-- print_artifacts. Exact role names and ownership are DBA decisions.

-- 13. Repository/service rules not expressible as simple CHECK constraints:
-- * source_metadata is parsed against the strict JSON v1 adapter before insert;
-- * source.metadata shape is not enforced by JSONB alone;
-- * artifact presence follows job lifecycle in one service transaction;
-- * fencing_generation is incremented monotonically under row lock;
-- * updated_at is written by every repository update (no automatic DEFAULT);
-- * legal state transitions, original-root reprints, minimum-one original,
--   and allowlist of port 9100 are service/configuration rules.
