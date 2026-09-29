# F3.7 / A09 — hasil increment

Status: READY FOR REVIEW

Login username/password controls now have explicit ids and associated labels; the password visibility control is an explicitly typed, named button. Print and SAP Simulation dialogs use a shared `useModalA11y` hook for Escape close, initial focus, focus restoration, and keyboard Tab containment. Dialog titles provide accessible names while the existing visual structure remains unchanged.

Verification: `npx tsc --noEmit` and frontend build/test are required from the reviewer. Dedicated browser keyboard tests are NOT RUN in this writer increment because the available harness has no component test adapter; browser E2E should use an isolated test server.
