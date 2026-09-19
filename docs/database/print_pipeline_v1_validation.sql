-- Thermal Label Studio - isolated disposable PostgreSQL validation harness
-- Run only in a fresh disposable database after print_pipeline_v1.sql:
--   psql -v ON_ERROR_STOP=1 -f print_pipeline_v1.sql
--   psql -v ON_ERROR_STOP=1 -f print_pipeline_v1_validation.sql
-- Every fixture is rolled back. No printer or external network is used.

\set ON_ERROR_STOP on
BEGIN;

-- Valid fixtures: two printers, two batches, two items, and original roots.
INSERT INTO media_profiles (media_profile_id, name)
VALUES ('MED-80X200', 'Validation media');

INSERT INTO media_profile_versions (
    media_profile_id, version, width_mm, height_mm, material_type,
    sensor_mode, orientation
)
VALUES ('MED-80X200', 1, 80, 200, 'paper', 'gap', 'portrait');

INSERT INTO template_versions (
    template_id, version, svg_payload_ref, svg_content_sha256,
    width_mm, height_mm, orientation
)
VALUES ('label-roll', 1, 'svg-template-v1', repeat('a', 64), 80, 200, 'portrait');

INSERT INTO printer_registry (
    printer_id, site_id, area_id, brand, model, delivery_mode,
    configured_media_profile_version_id, network_host, network_port,
    gateway_executor_id, trusted_bridge_id, printer_language, emulation, confirmed_dpi
)
VALUES
    ('printer-ipl', 'site-test', 'line-1', 'HONEYWELL', 'PM45', 'central_tcp',
     (SELECT media_profile_version_id FROM media_profile_versions WHERE media_profile_id = 'MED-80X200' AND version = 1),
     '192.0.2.10', 9100, NULL, NULL, 'ipl', 'native', 203),
    ('printer-zpl', 'site-test', 'line-2', 'ZEBRA', 'ZT-TEST', 'gateway_agent',
     (SELECT media_profile_version_id FROM media_profile_versions WHERE media_profile_id = 'MED-80X200' AND version = 1),
     NULL, NULL, 'agent-zpl', NULL, 'zpl', 'zsim2', 300);

INSERT INTO print_batches (
    batch_id, producer_namespace, request_id, source_metadata,
    raw_contract_sha256, canonical_payload_snapshot, printer_id,
    configured_media_profile_version_id, printer_capability_snapshot,
    status, total_items, expires_at
)
VALUES
    ('00000000-0000-0000-0000-000000000101', 'sap-test', 'request-101', '{"contract_version":"1.0"}', repeat('b', 64), '{}',
     'printer-ipl', (SELECT media_profile_version_id FROM media_profile_versions WHERE media_profile_id = 'MED-80X200' AND version = 1), '{}', 'accepted', 1, CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000102', 'sap-test', 'request-102', '{"contract_version":"1.0"}', repeat('c', 64), '{}',
     'printer-zpl', (SELECT media_profile_version_id FROM media_profile_versions WHERE media_profile_id = 'MED-80X200' AND version = 1), '{}', 'accepted', 1, CURRENT_TIMESTAMP + INTERVAL '1 day');

INSERT INTO print_batch_items (item_id, batch_id, item_sequence, template_version_id, canonical_item_data, item_data_sha256)
VALUES
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 1,
     (SELECT template_version_id FROM template_versions WHERE template_id = 'label-roll' AND version = 1), '{}', repeat('d', 64)),
    ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', 1,
     (SELECT template_version_id FROM template_versions WHERE template_id = 'label-roll' AND version = 1), '{}', repeat('e', 64)),
    ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101', 2,
     (SELECT template_version_id FROM template_versions WHERE template_id = 'label-roll' AND version = 1), '{}', repeat('1', 64));

-- Original roots are valid fixtures for every reprint test.
INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, status, expires_at)
VALUES
    ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'original', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'printer-zpl', 'original', 'queued', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000203', 'printer-ipl', 'original', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day');

-- Positive lifecycle fixture: accepted -> queued -> claimed -> sending.
UPDATE print_jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP
WHERE job_id = '00000000-0000-0000-0000-000000000301';

-- Artifact fixtures are created after queueing and before claim, matching the
-- intended service lifecycle. Artifact presence itself remains a service rule.
INSERT INTO print_artifacts (
    job_id, payload_ref, filename, media_type, byte_length, artifact_sha256,
    printer_language_snapshot, renderer_version, template_version_id,
    printer_capability_snapshot, retention_expires_at
)
VALUES
    ('00000000-0000-0000-0000-000000000301', 'artifact-ipl-301', 'label.ipl', 'application/octet-stream', 10, repeat('f', 64), 'ipl', 'renderer-test',
     (SELECT template_version_id FROM template_versions WHERE template_id = 'label-roll' AND version = 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000302', 'artifact-zpl-302', 'label.zpl', 'application/octet-stream', 10, repeat('0', 64), 'zpl', 'renderer-test',
     (SELECT template_version_id FROM template_versions WHERE template_id = 'label-roll' AND version = 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

UPDATE print_jobs
SET status = 'claimed', executor_type = 'central_dispatcher', executor_id = 'dispatcher-test',
    claimed_at = CURRENT_TIMESTAMP, lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', fencing_token = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE job_id = '00000000-0000-0000-0000-000000000301';
UPDATE print_jobs SET status = 'sending', attempt_count = 1, updated_at = CURRENT_TIMESTAMP
WHERE job_id = '00000000-0000-0000-0000-000000000301';

-- Valid dispatch state points to the batch belonging to the same printer.
INSERT INTO printer_dispatch_state (
    printer_id, active_batch_id, executor_type, executor_id,
    fencing_generation, acquired_at, lease_expires_at
)
VALUES ('printer-ipl', '00000000-0000-0000-0000-000000000101', 'central_dispatcher', 'dispatcher-test', 1,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 minutes');

-- Valid outbox states. Published deliberately clears all claim fields.
INSERT INTO print_job_outbox (outbox_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload)
VALUES ('00000000-0000-0000-0000-000000000401', 'job', '00000000-0000-0000-0000-000000000301', 'job_accepted', 'outbox-pending', '{}');
INSERT INTO print_job_outbox (outbox_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload,
                              status, claimed_by, claimed_at, claim_expires_at)
VALUES ('00000000-0000-0000-0000-000000000402', 'job', '00000000-0000-0000-0000-000000000301', 'job_rendered', 'outbox-publishing', '{}',
        'publishing', 'worker-test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 minutes');
INSERT INTO print_job_outbox (outbox_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload,
                              status, published_at)
VALUES ('00000000-0000-0000-0000-000000000403', 'job', '00000000-0000-0000-0000-000000000301', 'job_queued', 'outbox-published', '{}',
        'published', CURRENT_TIMESTAMP);

INSERT INTO print_audit_events (audit_event_id, actor_type, actor_id, action, aggregate_type, aggregate_id)
VALUES ('00000000-0000-0000-0000-000000000501', 'system', 'validation', 'fixture', 'job', '00000000-0000-0000-0000-000000000301');

-- Negative: result outcome must agree with the persisted final status.
-- Expected SQLSTATE 23514 / chk_print_jobs_result_consistency.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        UPDATE print_jobs
        SET result_outcome = 'success'
        WHERE job_id = '00000000-0000-0000-0000-000000000301';

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: result outcome mismatches status';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_result_consistency'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid printer fixture, only emulation is invalid.
-- Expected SQLSTATE 23514 / chk_printer_registry_language_emulation.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO printer_registry (printer_id, site_id, area_id, brand, model, delivery_mode, configured_media_profile_version_id, network_host, network_port, printer_language, emulation, confirmed_dpi)
        VALUES ('bad-ipl-zsim2', 'site-test', 'line-x', 'HONEYWELL', 'PM45', 'central_tcp', (SELECT media_profile_version_id FROM media_profile_versions LIMIT 1), '192.0.2.11', 9100, 'ipl', 'zsim2', 203);

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: invalid printer language emulation';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_printer_registry_language_emulation'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: only central_tcp endpoint completeness is invalid.
-- Expected SQLSTATE 23514 / chk_printer_registry_delivery_endpoint.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO printer_registry (printer_id, site_id, area_id, brand, model, delivery_mode, configured_media_profile_version_id, printer_language, emulation, confirmed_dpi)
        VALUES ('bad-central-endpoint', 'site-test', 'line-x', 'HONEYWELL', 'PM45', 'central_tcp', (SELECT media_profile_version_id FROM media_profile_versions LIMIT 1), 'ipl', 'native', 203);

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: incomplete central_tcp delivery endpoint';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_printer_registry_delivery_endpoint'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: only gateway_agent endpoint ambiguity is invalid.
-- Expected SQLSTATE 23514 / chk_printer_registry_delivery_endpoint.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO printer_registry (printer_id, site_id, area_id, brand, model, delivery_mode, configured_media_profile_version_id, network_host, network_port, gateway_executor_id, printer_language, emulation, confirmed_dpi)
        VALUES ('bad-gateway-endpoint', 'site-test', 'line-x', 'ZEBRA', 'ZT-TEST', 'gateway_agent', (SELECT media_profile_version_id FROM media_profile_versions LIMIT 1), '192.0.2.12', NULL, 'agent-bad', 'zpl', 'native', 203);

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: ambiguous gateway_agent delivery endpoint';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_printer_registry_delivery_endpoint'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid reprint parent/item/batch, only printer_id differs from batch.
-- Expected SQLSTATE 23503 / fk_print_jobs_batch_printer.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-zpl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: job printer differs from batch printer';
    EXCEPTION
        WHEN foreign_key_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23503'
               OR actual_constraint IS DISTINCT FROM 'fk_print_jobs_batch_printer'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: printer-zpl has no dispatch row, only active batch printer binding differs.
-- Expected SQLSTATE 23503 / fk_dispatch_active_batch_printer.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO printer_dispatch_state (printer_id, active_batch_id, executor_type, executor_id, fencing_generation, acquired_at, lease_expires_at)
        VALUES ('printer-zpl', '00000000-0000-0000-0000-000000000101', 'gateway_agent', 'agent-zpl', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 minutes');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: dispatch active batch printer mismatch';
    EXCEPTION
        WHEN foreign_key_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23503'
               OR actual_constraint IS DISTINCT FROM 'fk_dispatch_active_batch_printer'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: item already has one valid original; only duplicate original is added.
-- Expected SQLSTATE 23505 / uq_print_jobs_single_original_per_item.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, status, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'original', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: duplicate original job per item';
    EXCEPTION
        WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23505'
               OR actual_constraint IS DISTINCT FROM 'uq_print_jobs_single_original_per_item'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid child fields, only parent item differs from child item.
-- Expected SQLSTATE 23503 / fk_print_jobs_reprint_parent.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'printer-zpl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: reprint parent item mismatch';
    EXCEPTION
        WHEN foreign_key_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23503'
               OR actual_constraint IS DISTINCT FROM 'fk_print_jobs_reprint_parent'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Positive setup for isolated self-reference: item 203 has original root 303.
-- Negative: existing row is changed to self-reprint, so FK remains valid.
-- Expected SQLSTATE 23514 / chk_print_jobs_no_self_reprint.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        UPDATE print_jobs SET job_kind = 'reprint', reprint_of_job_id = job_id
        WHERE job_id = '00000000-0000-0000-0000-000000000303';

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: self reprint prohibited';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_no_self_reprint'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: accepted fixture has only executor_id; all other invariants are valid.
-- Expected SQLSTATE 23514 / chk_print_jobs_claim_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, executor_id, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', 'partial', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: accepted job partial claim';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_claim_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: claimed fixture has only executor_type; all other invariants are valid.
-- Expected SQLSTATE 23514 / chk_print_jobs_claim_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, executor_type, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'claimed', 'central_dispatcher', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: claimed job partial claim';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_claim_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: failed partial claim; fixture is a valid reprint with one field changed.
-- Expected SQLSTATE 23514 / chk_print_jobs_claim_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, executor_id, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000606', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'failed', 'partial', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: failed job partial claim';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_claim_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: expired partial claim; only executor_id is supplied.
-- Expected SQLSTATE 23514 / chk_print_jobs_claim_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, executor_id, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'expired', 'partial', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: expired job partial claim';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_claim_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: cancelled partial claim; only executor_id is supplied.
-- Expected SQLSTATE 23514 / chk_print_jobs_claim_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, executor_id, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000608', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'cancelled', 'partial', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: cancelled job partial claim';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_claim_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: claim lease is equal to claimed_at; claim shape is otherwise complete.
-- Expected SQLSTATE 23514 / chk_print_jobs_lease_order.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, executor_type, executor_id, claimed_at, lease_expires_at, fencing_token, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000609', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'claimed', 'central_dispatcher', 'bad', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: claim lease order invalid';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_lease_order'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: sending has a complete claim but attempt_count is zero.
-- Expected SQLSTATE 23514 / chk_print_jobs_delivery_attempt.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, attempt_count, executor_type, executor_id, claimed_at, lease_expires_at, fencing_token, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'sending', 0, 'central_dispatcher', 'bad', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 minutes', 1, CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: sending status zero attempt count';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_jobs_delivery_attempt'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Valid helper jobs for artifact negatives: each is a reprint of original 301.
INSERT INTO print_jobs (job_id, batch_id, item_id, printer_id, job_kind, reprint_of_job_id, status, expires_at)
VALUES
    ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000613', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000615', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000616', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000617', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000618', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    ('00000000-0000-0000-0000-000000000619', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'printer-ipl', 'reprint', '00000000-0000-0000-0000-000000000301', 'accepted', CURRENT_TIMESTAMP + INTERVAL '1 day');

-- Negative: valid rendered/reprint fixture with only media_type invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_media_type.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000611', 'artifact-bad-media', 'label.ipl', 'text/plain', 1, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact media type invalid';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_media_type'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only filename-language compatibility invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_filename_language.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000612', 'artifact-bad-name', 'label.zpl', 'application/octet-stream', 1, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact filename language mismatch';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_filename_language'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only payload_ref traversal invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_payload_ref.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000613', '../artifact', 'label.ipl', 'application/octet-stream', 1, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact payload ref path traversal';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_payload_ref'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only payload_ref URL-like colon invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_payload_ref.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000614', 'https://bad', 'label.ipl', 'application/octet-stream', 1, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact payload ref url scheme';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_payload_ref'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only payload_ref slash/backslash/path invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_payload_ref.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000615', 'dir\\artifact', 'label.ipl', 'application/octet-stream', 1, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact payload ref slash delimiter';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_payload_ref'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only byte_length zero invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_byte_length.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000616', 'artifact-zero', 'label.ipl', 'application/octet-stream', 0, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact byte length zero';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_byte_length'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only byte_length maximum invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_byte_length.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000617', 'artifact-large', 'label.ipl', 'application/octet-stream', 10485761, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact byte length exceeds maximum';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_byte_length'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only checksum format invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_checksum.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000618', 'artifact-bad-sha', 'label.ipl', 'application/octet-stream', 1, 'BAD', 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP + INTERVAL '1 day');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact checksum invalid format';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_checksum'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid rendered/reprint fixture with only retention order invalid.
-- Expected SQLSTATE 23514 / chk_print_artifacts_retention.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_artifacts (job_id, payload_ref, filename, media_type, byte_length, artifact_sha256, printer_language_snapshot, renderer_version, template_version_id, printer_capability_snapshot, created_at, retention_expires_at)
        VALUES ('00000000-0000-0000-0000-000000000619', 'artifact-bad-retention', 'label.ipl', 'application/octet-stream', 1, repeat('a', 64), 'ipl', 'r', (SELECT template_version_id FROM template_versions LIMIT 1), '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: artifact retention expiry order invalid';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_print_artifacts_retention'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid pending outbox fixture with only claimed_by invalid.
-- Expected SQLSTATE 23514 / chk_outbox_state_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_job_outbox (aggregate_type, aggregate_id, event_type, deduplication_key, payload, claimed_by)
        VALUES ('job', '00000000-0000-0000-0000-000000000301', 'bad', 'outbox-pending-partial', '{}', 'worker-only');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: outbox pending state fields invalid';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_outbox_state_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid publishing outbox fixture with only claim timestamps incomplete.
-- Expected SQLSTATE 23514 / chk_outbox_state_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_job_outbox (aggregate_type, aggregate_id, event_type, deduplication_key, payload, status, claimed_by)
        VALUES ('job', '00000000-0000-0000-0000-000000000301', 'bad', 'outbox-publishing-partial', '{}', 'publishing', 'worker-only');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: outbox publishing timestamps incomplete';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_outbox_state_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid publishing outbox fixture with only claim lease order invalid.
-- Expected SQLSTATE 23514 / chk_outbox_claim_order.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_job_outbox (aggregate_type, aggregate_id, event_type, deduplication_key, payload, status, claimed_by, claimed_at, claim_expires_at)
        VALUES ('job', '00000000-0000-0000-0000-000000000301', 'bad', 'outbox-publishing-order', '{}', 'publishing', 'worker', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: outbox publishing claim lease order invalid';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_outbox_claim_order'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid published outbox fixture with only published_at missing.
-- Expected SQLSTATE 23514 / chk_outbox_state_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_job_outbox (aggregate_type, aggregate_id, event_type, deduplication_key, payload, status)
        VALUES ('job', '00000000-0000-0000-0000-000000000301', 'bad', 'outbox-published-missing-time', '{}', 'published');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: outbox published timestamp missing';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_outbox_state_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid published outbox fixture with only claim fields retained.
-- Expected SQLSTATE 23514 / chk_outbox_state_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_job_outbox (aggregate_type, aggregate_id, event_type, deduplication_key, payload, status, claimed_by, claimed_at, claim_expires_at, published_at)
        VALUES ('job', '00000000-0000-0000-0000-000000000301', 'bad', 'outbox-published-claim', '{}', 'published', 'worker', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 minute', CURRENT_TIMESTAMP);

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: outbox published claim fields retained';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_outbox_state_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid failed outbox fixture with only partial claim.
-- Expected SQLSTATE 23514 / chk_outbox_state_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_job_outbox (aggregate_type, aggregate_id, event_type, deduplication_key, payload, status, claimed_by)
        VALUES ('job', '00000000-0000-0000-0000-000000000301', 'bad', 'outbox-failed-partial', '{}', 'failed', 'worker');

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: outbox failed partial claim';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_outbox_state_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: valid failed outbox fixture with only published_at set.
-- Expected SQLSTATE 23514 / chk_outbox_state_fields.
DO $$
DECLARE
    actual_constraint TEXT;
BEGIN
    BEGIN
        INSERT INTO print_job_outbox (aggregate_type, aggregate_id, event_type, deduplication_key, payload, status, published_at)
        VALUES ('job', '00000000-0000-0000-0000-000000000301', 'bad', 'outbox-failed-published', '{}', 'failed', CURRENT_TIMESTAMP);

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: outbox failed published timestamp set';
    EXCEPTION
        WHEN check_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23514'
               OR actual_constraint IS DISTINCT FROM 'chk_outbox_state_fields'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: existing audit fixture UPDATE must be rejected by the audit protection trigger.
-- Expected SQLSTATE 23001 / trg_protect_audit_events.
DO $$
DECLARE
    found_count INTEGER;
    actual_constraint TEXT;
BEGIN
    SELECT count(*) INTO found_count FROM print_audit_events
    WHERE audit_event_id = '00000000-0000-0000-0000-000000000501';
    IF found_count <> 1 THEN RAISE EXCEPTION 'audit fixture missing'; END IF;

    BEGIN
        UPDATE print_audit_events SET action = 'mutated'
        WHERE audit_event_id = '00000000-0000-0000-0000-000000000501';

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: audit update mutation rejected';
    EXCEPTION
        WHEN restrict_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23001'
               OR actual_constraint IS DISTINCT FROM 'trg_protect_audit_events'
            THEN
                RAISE;
            END IF;
    END;
END $$;

-- Negative: existing audit fixture DELETE must be rejected by the audit protection trigger.
-- Expected SQLSTATE 23001 / trg_protect_audit_events.
DO $$
DECLARE
    found_count INTEGER;
    actual_constraint TEXT;
BEGIN
    SELECT count(*) INTO found_count FROM print_audit_events
    WHERE audit_event_id = '00000000-0000-0000-0000-000000000501';
    IF found_count <> 1 THEN RAISE EXCEPTION 'audit fixture missing'; END IF;

    BEGIN
        DELETE FROM print_audit_events
        WHERE audit_event_id = '00000000-0000-0000-0000-000000000501';

        RAISE EXCEPTION
            USING ERRCODE = 'P0001',
                  MESSAGE = 'expected violation was not raised: audit delete rejected';
    EXCEPTION
        WHEN restrict_violation THEN
            GET STACKED DIAGNOSTICS
                actual_constraint = CONSTRAINT_NAME;

            IF SQLSTATE <> '23001'
               OR actual_constraint IS DISTINCT FROM 'trg_protect_audit_events'
            THEN
                RAISE;
            END IF;
    END;
END $$;

ROLLBACK;
\echo 'VALIDATION_PASS_IF_NO_ERROR'
