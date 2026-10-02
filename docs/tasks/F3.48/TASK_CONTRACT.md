# F3.48 — Frontend test environment repair

## Goal

Diagnose and repair only the local frontend test-runner failure caused by missing `node_modules/canvas/build/Release/canvas.node`.

## Boundaries

Inspect package configuration, lockfile, test loader, and installed dependency state. Do not modify product UI, backend, auth, Docker, printer/ports, or Git lifecycle. Do not use network or install packages until diagnosis proves it necessary; if required, report the exact command/blocker rather than install.

## Acceptance

Run full `npm test` and distinguish assertion failures from environment failure; run tsc/build/diff and document exact outcomes.
