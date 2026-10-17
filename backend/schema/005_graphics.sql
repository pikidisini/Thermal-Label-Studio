-- Apply explicitly to an authorized Studio PostgreSQL target. Never run on startup.
CREATE SCHEMA IF NOT EXISTS label_studio;
CREATE TABLE IF NOT EXISTS label_studio.graphics (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
 content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
 content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 393000),
 width integer NOT NULL CHECK (width BETWEEN 1 AND 4096),
 height integer NOT NULL CHECK (height BETWEEN 1 AND 4096 AND width::bigint * height <= 4000000),
 created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS graphics_created_idx ON label_studio.graphics(created_at DESC,id);
