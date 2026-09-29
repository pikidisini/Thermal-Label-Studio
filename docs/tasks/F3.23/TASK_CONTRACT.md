# F3.23 — MinIO object storage

Scope: opt-in MinIO storage for custom SVG templates and print artifacts, plus a non-destructive, verifiable migration utility. Filesystem remains the default; built-in templates remain local. No deletion, printer, SAP, or production deployment is included.

Acceptance criteria: MinIO artifact writes publish payload before manifest, reads require and verify the manifest/checksum, repeated identical refs are idempotent, conflicting refs fail closed, and existing template Path callers work through a private materialized cache. `STORAGE_BACKEND=minio` selects the adapter; invalid/unavailable configuration fails closed.
