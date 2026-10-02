# F3.60 Review — Fabric Import Consistency and SSR-safe Canvas Effect

## Review scope

Independent review covered the Fabric import inventory, QR action path, model-only Barcode dependency path, isomorphic effect helper, both direct layout-effect consumers, warning outcomes, and frontend quality gates.

## Findings

### 1. Fabric import strategy is now consistent in production runtime

QR was the only runtime feature dynamically importing Fabric while Canvas and all other editor object-creation features imported it statically. QR now uses the static editor dependency and retains the same asynchronous flow: QR data URL generation, `fabric.Image.fromURL` callback, canvas insertion, selection synchronization, history capture, rendering, and simulation trigger. The only remaining dynamic Fabric import is in browser test code, not production source.

### 2. SSR-safe effect preserves browser timing

`useIsomorphicLayoutEffect` selects `useLayoutEffect` only when a real `window.document` is available and selects `useEffect` for SSR/Node. `StudioCanvas` and `AnchoredOverlay` are the two audited direct users. Their browser layout timing remains unchanged, while Node component rendering no longer emits the layout-effect warning.

### 3. Model-only consumers do not accidentally load editor hooks

The Barcode preview model imports the QR model directly instead of the QR feature barrel. This avoids forcing Node model/test consumers through the QR action hook that now has the editor's static Fabric dependency.

## Independent quality gates

| Check | Status | Evidence |
| --- | --- | --- |
| Runtime import/effect inspection | PASS | QR uses a static Fabric import; audited direct layout-effect consumers use the shared isomorphic helper. |
| Frontend tests | PASS | `npm.cmd test`: 130 passed, 0 failed; prior StudioCanvas SSR layout-effect warning absent. |
| TypeScript | PASS | `npm.cmd exec tsc -- --noEmit` completed successfully. |
| Production build | PASS | `npm.cmd run build`: 1,886 modules transformed; prior Fabric dynamic/static import advisory absent. |
| Diff whitespace | PASS | `git diff --check`: exit code 0; existing CRLF normalization notices only. |

## Evidence limits

- Browser manual regression was not run. The change is internal and automated source, test, typecheck, and build evidence passes.
- No backend/API/auth/store/tool behavior/Table/UI flow/dependency/Git lifecycle/Docker/network/printer/spooler/hardware action occurred.

## Decision

**APPROVED.** F3.60 resolves both identified non-failing warnings without changing the browser Canvas or QR behavior.
