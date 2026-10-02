# F3.60 — Fabric Import Consistency and SSR-safe Canvas Effect

## Objective

Remove the non-failing build and SSR advisories identified after F3.59 without changing editor behavior.

## Evidence inventory

- Fabric is statically imported by the Canvas lifecycle and all other runtime object-creation features. `features/qr/hooks/useQrActions.ts` was the only runtime dynamic Fabric importer.
- Direct `useLayoutEffect` calls existed in `features/canvas/ui/StudioCanvas.tsx` and `shared/ui/layers/AnchoredOverlay.tsx`.

## Scope

- Align QR with the editor's static Fabric import strategy while preserving its QR data generation and Fabric image callback behavior.
- Add a shared isomorphic layout-effect helper: browser uses `useLayoutEffect`; SSR/Node uses `useEffect`.
- Apply the helper to the two audited direct callers. Browser DOM timing remains layout-timed.
- Add focused source-boundary coverage and run the full frontend quality gates.

## Exclusions

No backend, API, auth, state semantic, Canvas visual/tool/lifecycle behavior, Table retirement behavior, dependencies, Git lifecycle, Docker, network, printer, spooler, or hardware changes.
