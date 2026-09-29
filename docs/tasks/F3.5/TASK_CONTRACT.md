# F3.5 / A03 — bounded simulation execution

- Writer: Luna Low
- Reviewer/advisor: Codex reviewer (parent task)
- Scope: minimal mitigation for the confirmed A03 risk in the existing filesystem simulation service.
- Repository: `web_app`, branch `codex/f3-4-architecture-safety-foundation`.

## Acceptance criteria

1. Simulation render/PDF work is bounded per process, with a conservative default of one active render.
2. Synchronous render work does not execute on the FastAPI event loop.
3. Existing submit, replay, startup recovery, and single-process behavior remain covered by the existing regression suite.
4. Tests prove the local bound and event-loop responsiveness.
5. Documentation states clearly that this does not implement durable multi-process uniqueness, leases, or a queue.

## Boundaries

Preserve A01/A02 changes. No database migration, deployment, printer/SAP call, or production PostgreSQL access. No claim of multi-worker safety. The next durable step requires a shared repository with a unique `(producer_namespace, request_id)` constraint, lease/claim semantics, and crash recovery.
