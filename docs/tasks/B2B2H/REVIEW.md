# Review — B2B2H: Safe Demo Mode & Batch Monitoring

- Reviewer: Codex
- Review level: 3 — independent implementation and evidence review
- Branch reviewed: `codex/b2b2h-safe-demo-mode`
- Baseline: `main` at `43abb3f`
- Review status: `APPROVED_FOR_CHECKPOINT`
- Physical printer / office TCP 9100 / SAP / production database: `NOT RUN` — prohibited by the task contract.

## Verdict

The demo boundary is safe in the important sense: the backend is default-off,
the simulator is in-memory, and no reviewed code path selects a physical
printer transport. The renderer is reused while dispatch is deliberately sent
only to `SimulatorSocketTransport`.

There are no P0, P1, or remaining P2 findings. The three P2 findings from the
initial review were corrected and independently verified. The implementation is
approved for the next checkpoint/commit review, but this approval does **not**
mean production readiness or authorization to merge.

## Follow-up review — 2026-09-22

The executor's corrections were inspected in the working tree:

- The Safe Demo button is now rendered only when `/api/status` explicitly
  reports `safe_demo_mode: true`; the frontend fails closed if that request
  fails.
- The checked-in Playwright backend process explicitly receives
  `SAFE_DEMO_MODE=true`, scoped to the local E2E web server. The application's
  default remains false.
- The modal visibly renders the synthetic-data disclaimer and the warning that
  in-memory state returns to its initial state after a backend restart.

Independent E2E verification now passes both cases:

```text
2 passed
1. default-off entry hidden
2. active demo: modal, notices, three items, simulation, and reset
```

The initial failing E2E evidence was therefore a real configuration defect,
not a test environment assumption, and is now resolved.

## Findings

### P2-1 — RESOLVED: The Safe Demo entry is visible even while Safe Demo is disabled

**Files:**

- `frontend/src/components/layout/topbar/TopBarActions.tsx`
- `frontend/src/App.tsx`

`btn-safe-demo` is rendered unconditionally. On the normal default-off backend
it opens the modal, calls the protected API, and displays the disabled error.
This contradicts the contract requirement that the Safe Demo UI/API be active
only after explicit demo activation, and the frontend test-plan requirement
that the entry appears only when demo is enabled.

**Required correction:** obtain the backend's `safe_demo_mode` status during
frontend startup (or use an equally explicit, documented local-demo startup
flag) and do not render/enable the entry unless it is true. This frontend check
is for usability only; the backend fail-closed guard must remain the security
boundary. Add an automated default-off UI assertion.

### P2-2 — RESOLVED: The checked-in Safe Demo E2E command does not enable demo mode

**Files:**

- `frontend/playwright.config.js`
- `frontend/tests/e2e/safe_demo.spec.js`

The Playwright web-server starts Uvicorn without `SAFE_DEMO_MODE=true`, while
the E2E expects fixture data and a completed simulation. Independent review
reproduced the failure with the checked-in command:

```text
npm.cmd exec playwright test tests/e2e/safe_demo.spec.js
FAIL — API returned the expected default-off message.
```

The same E2E passes only when the reviewer explicitly injects
`SAFE_DEMO_MODE=true` for its loopback test server. Therefore the executor's
claimed default command result is not reproducible from this branch.

**Required correction:** make the demo E2E configuration explicitly and
locally set `SAFE_DEMO_MODE=true` for the backend process it starts, without
changing the application's default environment. Keep a separate assertion that
the normal default-off UI hides the entry and backend endpoints stay
fail-closed.

### P2-3 — RESOLVED: Required synthetic-data and restart-loss notices are absent from UI

**File:** `frontend/src/components/modals/SafeDemoModal.tsx`

The backend response correctly carries the disclaimer
`Demo data / not SAP production data`, but the modal never renders it. The
modal says `In-Memory State`, but does not explicitly tell the user that the
demo state disappears when the backend restarts. Both notices are required by
the contract's data and user-clarity sections.

**Required correction:** visibly render the backend disclaimer and add plain
Indonesian text such as: `State demo hanya berada di memori dan akan kembali
ke awal saat backend direstart.` Add frontend/E2E assertions for both notices.

## Acceptance-criteria assessment

| Criterion | Review result | Evidence |
| --- | --- | --- |
| AC 1 — Default-off API | `PASS` | Independent backend test: protected endpoints return 404 when env is absent. |
| AC 2 — No physical route | `PASS` | Service uses `SimulatorSocketTransport`; targeted tests also patch socket/Raw TCP paths. No physical I/O was run. |
| AC 3 — Visible three-item batch | `PASS WHEN ENABLED` | Fixture contains three ordered, distinct `copies=1` items; active-mode E2E passes. |
| AC 4 — Visible lifecycle | `PASS WHEN ENABLED` | Active-mode loopback E2E completes and resets the three simulator items. |
| AC 5 — Safe reset | `PASS` | Backend test verifies reset recreates only in-memory demo state. |
| AC 6 — User clarity | `PASS` | Modal renders synthetic-data and restart-loss notices in Indonesian. |
| AC 7 — Error resilience | `PASS` | Backend route returns generic error; reviewed UI displays a bounded error banner. |
| AC 8 — Evidence | `PASS` | Targeted backend/frontend tests and the checked-in E2E pass; prohibited physical evidence remains `NOT RUN`. |

## Independent verification

| Check | Result |
| --- | --- |
| `python -m pytest backend/tests/test_safe_demo.py -q -p no:cacheprovider` | `PASS` — 7 passed, 2 external deprecation warnings |
| `npm.cmd test` in `frontend/` | `PASS` — 49 passed |
| `npm.cmd exec tsc -- --noEmit` in `frontend/` | `PASS` — no output / exit 0 |
| Checked-in Safe Demo Playwright command | `PASS` — 2 passed (default-off hidden + active simulation) |
| `git diff --check` | `PASS` — no whitespace errors; normal Windows line-ending warnings only |

## Required next action

The B2B2H implementation is ready for a checkpoint commit/PR workflow. Keep
the Safe Demo branch separate from `main`, and do not describe this result as
production readiness. Commit/push/PR/merge still require an explicit user
instruction.

## Residual boundaries after correction

- The demo is an educational local simulator, not evidence of a real printer,
  office network, SAP, persistence, throughput, or production readiness.
- Physical printer, office TCP 9100, Docker/PostgreSQL production resources,
  SAP, credentials, and intranet access remain `NOT RUN`.
