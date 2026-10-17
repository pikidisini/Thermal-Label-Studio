-- Apply only to an explicitly authorized named Studio PostgreSQL target.
-- Runtime never applies this schema; this does not change management_state/audit.
CREATE SCHEMA IF NOT EXISTS app_management;
CREATE TABLE IF NOT EXISTS app_management.activity_log (
    sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'
                               AND octet_length(event::text) <= 262144)
);
-- Separate runtime owner: explicitly grant USAGE on app_management,
-- SELECT/INSERT on activity_log and USAGE/SELECT on activity_log_sequence_seq.
-- Do not grant UPDATE/DELETE. Retention requires its own operational scope.
