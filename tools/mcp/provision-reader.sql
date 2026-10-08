-- Explicit administrative action against thermal_label_studio only.
-- Run once; existing role fails rather than silently changing its privileges.
-- Set its password interactively with psql: \password thermal_label_ai_readonly
BEGIN;
DO $$
BEGIN
    IF current_database() <> 'thermal_label_studio' THEN
        RAISE EXCEPTION 'Reader provisioning requires database thermal_label_studio';
    END IF;
END;
$$;
CREATE ROLE thermal_label_ai_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT CONNECT ON DATABASE thermal_label_studio TO thermal_label_ai_readonly;
GRANT USAGE ON SCHEMA label_studio TO thermal_label_ai_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA label_studio TO thermal_label_ai_readonly;
ALTER ROLE thermal_label_ai_readonly SET default_transaction_read_only = on;
ALTER ROLE thermal_label_ai_readonly SET statement_timeout = '5s';
COMMIT;
-- Future tables are not granted automatically. Review and grant them explicitly.
