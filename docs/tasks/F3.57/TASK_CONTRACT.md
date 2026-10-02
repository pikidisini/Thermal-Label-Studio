# F3.57 — Canvas Composition Boundary

## Goal

Make ownership at the Canvas composition boundary explicit without changing Fabric behavior or splitting cross-tool orchestration into superficial wrappers.

## Scope

- Audit the actual callers and responsibilities of `AuthenticatedStudio`, `useCanvasActions`, `useDrawingTools`, `usePlacementHelper`, and Canvas feature lifecycle modules.
- Preserve Canvas public API usage by the editor shell.
- Add focused regression evidence for the resulting ownership boundary.
- Document retained adapters and legacy Table interoperability.

## Constraints

Do not change Canvas rendering, tool modes, keyboard/mouse/touch behavior, Table interoperability, backend/API/auth/store semantics, UI flow, dependencies, Git lifecycle, Docker, services, printer, spooler, or hardware. Preserve the existing dirty worktree. A legacy module may only be deleted with zero-reference evidence and no behavior risk.

## Acceptance criteria

- `AuthenticatedStudio` consumes Canvas through `features/canvas` public API rather than a Canvas internal import.
- `useCanvasActions` is explicitly retained only as cross-feature orchestration for Line, Text, Barcode, QR, Graphics, Image, ordering, and held Table actions.
- Canvas lifecycle ownership remains in `features/canvas/editor/useFabricCanvas`; drawing listener and placement helper ownership are documented as orchestration adapters.
- Focused structural coverage captures the boundary and Table hold.
- Run frontend tests, TypeScript, production build, and diff whitespace checks.
