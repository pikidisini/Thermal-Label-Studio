# F3.14 — Result

## Implemented

- Added `frontend/src/utils/localSapJsonParser.ts` for bounded v1.1 and raw v2 parsing.
- Added local JSON file selection, item selection, explicit exploration banner, and parser error state to the SAP Tokens panel.
- Connected valid local data to `useContractStore` in browser memory. The explicit Preview flow sends the active contract to this application's local render service; invalid files leave the previous valid state unchanged.
- Kept canvas objects in place without replacing or rebuilding them; imported values become available through the existing token insertion actions, and existing dynamic text objects update their displayed value when the active item changes.
- Disabled insertion for raw field names outside `[a-zA-Z0-9_-]+`, with a visible explanation. Null and empty values remain distinct in the token drawer.
- Existing dynamic text objects now re-resolve their `dataField` when the active local item changes, preserving their Fabric geometry and adding a history snapshot before re-rendering.

## Evidence

- `npm test` PASS — 91/91 tests.
- `npm run typecheck:core` PASS.
- `npm exec tsc -- --noEmit` PASS.
- `npm run build` PASS.
- `git diff --check` PASS (with existing CRLF normalization warnings only).
- Browser trial PASS on isolated `127.0.0.1:8765` using the synthetic raw v2 fixture: imported 3 items, bound `material_number`, and verified item 1 renders `SYN-MAT-0001` while item 2 renders `SYN-MAT-0002` in both vector and thermal images.
- No printer, SAP, production database, server batch import, or persistent browser storage was used. Preview requests do send the active contract to the local render service.

## Remaining

- This is exploration-only and does not apply production profile/rule registries or derive barcode/QR values.
- Dynamic barcode/QR image pixels are not rewritten on item switching; this remains a documented limitation of the narrow text-binding correction.
- The inspection panel currently reports `Tokens: 0` for literal-resolved dynamic text; this is an existing inspection representation limitation and is not a production parity claim.
