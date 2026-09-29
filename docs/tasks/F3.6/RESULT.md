# F3.6 / A07 — hasil increment

Status: PARTIAL / READY FOR REVIEW

`useThermalSimulation` now assigns a generation to each scheduled render, cancels superseded debounce timers even when switching back to design mode, clears stale loading state, and commits blobs, inspection, errors, and loading completion only when that generation is still current and the hook remains mounted. `useTemplateManager` applies the active template ID only after the matching request succeeds and ignores stale responses. Initialization relies on the template manager's idempotent guard; failed initialization remains recoverable on remount/refresh, while an automated retry UI is deferred. No unbounded retry loop is introduced.

Failed template requests leave the last committed template and canvas untouched. Unsaved draft detection remains explicitly deferred because the existing history/preview dirty state does not prove whether the document has been saved.

Verification: a deferred-callback test for the Fabric importer was not added because the current Node/tsx harness has no DOM/Fabric test adapter and cannot safely patch the ESM Fabric callbacks. Reviewer gates after the correction: `npm test` **85 passed**, `npm run build` **PASS**, `npm run typecheck:core` **PASS**, and `npm exec tsc -- --noEmit` **PASS**. Browser E2E and visual regression are NOT RUN. Fabric callbacks are guarded in production code, but an adapter-level deferred test remains required before closing A07.
