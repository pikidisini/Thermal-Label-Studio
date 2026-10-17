# Contributing

Read `README.md`, `AGENTS.md`, and the active documents in `docs/` before editing.
Archived code and documents are historical reference, not a compatibility target.

Keep one active writer per change. Inspect the working tree, preserve existing
changes, and define the behavior, scope, and acceptance checks before coding.
Use a focused branch; review the actual diff and evidence before integration.

Implement one consumed boundary at a time. Avoid compatibility layers,
speculative frameworks, and broad relocation unrelated to the requested behavior.
Product chrome supports English and Bahasa Indonesia through shared dictionaries;
technical contracts use English. Never translate authored content, keys or payloads.
Run Python commands from this repository root and npm commands from frontend/.
The parent workspace has a separate Git repository; verify the root before staging.

Test new behavior, invalid input, missing resources, access denial, and failures
relevant to the slice. Shared raster/payload changes require evidence that
simulation captures exactly what the print transport would receive. Use fake
transports and disposable fixtures by default.

External SAP, printer, database/object-store, and container actions require
explicit authorization for a named target. Do not repurpose operational data
as test fixtures or put secrets/business payloads in source or reports.

Record changed behavior, executed checks, unresolved blockers, and remaining work.
Use PASS, FAIL, BLOCKED, or NOT RUN according to actual evidence. Keep active
documentation aligned with implementation; production readiness requires its
own validation.

Use scripts/check_project.py --run-source-checks for the current checkout source
gate. Keep full TypeScript/build/regression distinct from core-only typechecks,
mock browser acceptance, live storage, packaged execution and physical devices.
Consult docs/implementation/universal-label-pipeline/STATUS.md before pipeline
work; do not close NEEDS_REPLAN using narrow source/fake evidence. Preserve
dated reports and update current contracts/status instead.
