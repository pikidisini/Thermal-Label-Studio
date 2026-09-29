# F3.6 / A07 — frontend latest-request-wins

- Writer: Luna Low
- Reviewer/advisor: Codex reviewer
- Scope: frontend preview race, template request race, and idempotent studio initialization.

Acceptance: stale preview responses cannot overwrite newer state; stale template responses cannot commit active ID or canvas; initialization runs once per mounted studio; failed template loads preserve the last committed template. No backend, deployment, printer, SAP, or database changes.

Dirty draft policy: the current editor has no reliable saved-versus-unsaved document marker. This increment therefore does not add an automatic destructive template replacement or a guessed confirmation prompt. A future explicit dirty-draft policy must be added before changing templates can be made destructive-safe.
