-- Apply only to a named, authorized Studio PostgreSQL target.
-- Normal application startup never executes this provisioning script.
CREATE SCHEMA IF NOT EXISTS app_management;
CREATE TABLE IF NOT EXISTS app_management.management_state (
    singleton boolean PRIMARY KEY CHECK (singleton = true),
    document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object')
);
CREATE TABLE IF NOT EXISTS app_management.management_audit (
    sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object')
);
-- Provision an initial Document using the existing validated intake policy.
-- Do not replace a configured policy with an empty policy implicitly.
-- Runtime role: SELECT/UPDATE management_state; SELECT/INSERT management_audit;
-- USAGE on app_management must be explicitly granted to a separate runtime role.
-- USAGE/SELECT on management_audit_sequence_seq; no DELETE or audit UPDATE.
