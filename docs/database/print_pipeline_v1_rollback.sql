-- Thermal Label Studio - Print Pipeline v1 rollback (PROPOSED)
-- Disposable development/test database only. Never run against production or
-- staging. Verified on disposable PostgreSQL 15.13 (cleans schema without CASCADE).
-- No CASCADE is used: dependency order is explicit and unexpected external
-- dependencies should fail the rollback rather than be removed silently.

ALTER TABLE printer_dispatch_state
    DROP CONSTRAINT fk_dispatch_active_batch_printer;

DROP TABLE print_audit_events;
DROP TABLE print_job_outbox;
DROP TABLE print_artifacts;
DROP TABLE print_jobs;
DROP TABLE print_batch_items;
DROP TABLE printer_dispatch_state;
DROP TABLE print_batches;
DROP TABLE printer_registry;
DROP TABLE template_versions;
DROP TABLE media_profile_versions;
DROP TABLE media_profiles;

DROP FUNCTION fn_prevent_audit_mutation();
