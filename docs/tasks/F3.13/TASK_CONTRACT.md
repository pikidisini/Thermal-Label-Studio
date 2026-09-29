# F3.13 / A10 — runnable quality gates

- Writer: Luna Low
- Reviewer/advisor: Codex reviewer
- Scope: replace fake frontend history assertions with production store behavior and record readiness/gate limits.

Acceptance: tests call `useHistoryStore` actions directly and cover undo/redo plus redo invalidation. Do not claim PostgreSQL/E2E readiness without provisioning. A readiness endpoint is deferred unless dependency checks are safe and meaningful.
