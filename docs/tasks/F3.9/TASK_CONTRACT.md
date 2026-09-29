# F3.9 / A05 — immutable simulation template pinning

- Writer: Luna Low
- Reviewer/advisor: Codex reviewer
- Scope: pin exact server-resolved SVG content at canonical/raw simulation ingestion and render from verified content-addressed snapshots.

Acceptance: accepted items record SHA-256 and snapshot reference; later source-template mutation cannot change output; missing/corrupt snapshots fail closed; old unpinned records are rejected explicitly. Preserve template IDs and simulation tolerant/strict behavior. No profile/rules registry, approval workflow, optimistic draft concurrency, database migration, or deployment.
