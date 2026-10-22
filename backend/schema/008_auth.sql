-- Explicit named-target provisioning only. Never applied by application startup.
CREATE SCHEMA IF NOT EXISTS studio_auth;
CREATE TABLE IF NOT EXISTS studio_auth.accounts (id text PRIMARY KEY, document jsonb NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_unique ON studio_auth.accounts ((document->>'username_key'));
CREATE TABLE IF NOT EXISTS studio_auth.sessions (id text PRIMARY KEY, document jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS studio_auth.login_limits (id text PRIMARY KEY, document jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS studio_auth.security_events (
    sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document jsonb NOT NULL
);
