# Architecture hardening review index — A03 through A11

Status: **REVIEWED WITH PARTIALS**. The implementation increments have been reviewed with the gates listed below; runtime and production-readiness evidence remains incomplete.

- **A03 / F3.5:** bounded single-process render gate and thread offload; durable multi-worker queue, lease, unique claim, and bounded admission remain P1 follow-up.
- **A04 / F3.8:** pure query summary/list use case extracted; ingestion/render/persistence/recovery remain in the large service, and filesystem enumeration is still O(n).
- **A05 / F3.9:** exact SVG bytes pinned by SHA-256 and verified during render; profile/rules approval registry, immutable approved lifecycle, and optimistic draft concurrency remain.
- **A06 / F3.11:** SQLite shared lockout state with atomic failure updates and fail-closed limiter errors; PostgreSQL/shared-host limiter migration remains.
- **A07 / F3.6:** latest-request guards, design-mode debounce cancellation, idempotent initialization, and guarded Fabric callback commit; deferred callback regression test and full dirty-draft policy remain gates.
- **A08 / F3.12:** strict core gate covers DTO seed and production history store; global strict/Fabric declarations/API and inspector migration remain.
- **A09 / F3.7:** login labels/password control and dialog keyboard semantics; dedicated browser keyboard regression remains NOT RUN.
- **A10 / F3.13:** frontend history test uses production Zustand store; PostgreSQL/E2E readiness gates remain NOT RUN.
- **A11 / F3.10:** Docker uses explicit lockfile with `npm ci`; resvg checksum is BLOCKED because no trusted repository value exists, and Python 3.11 lock was not fabricated from Python 3.14.

Verified reviewer gates: backend **510 passed, 22 skipped, 2 warnings**; frontend **85 passed**; frontend build PASS; `npm run typecheck:core` PASS; `npm exec tsc -- --noEmit` PASS; `git diff --check` PASS. Remaining gates before any production-readiness claim: isolated browser E2E and keyboard regression, PostgreSQL concurrency/restore checks, Docker image build/runtime smoke, security review, observability, backup/rollback, SAP DEV validation, and physical printer validation. No increment authorizes commit, push, merge, deployment, SAP, printer, or production DB access.
