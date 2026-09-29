# F3.14 — Review

## Status

**REVIEWED — ACCEPTED WITH EXPLORATION LIMITATIONS**

## Reviewer findings

- Local v1.1 and raw v2 JSON parsing is bounded and state selection remains in browser memory; the explicit Preview action sends the active contract to the application's local render service.
- The synthetic raw v2 fixture with three items imports successfully. Nested non-scalar provenance is retained as a warning and excluded from token values.
- Raw item switching updates the active token map without replacing the canvas. Existing dynamic text objects re-resolve their `dataField`, preserve geometry, and update both vector and thermal preview output.
- Invalid local input preserves the last valid state. Sample contract selection clears the local import context.
- Unsupported field names remain visible and cannot be inserted into the current preview token grammar.

## Evidence reviewed

- `npm test`: 91/91 PASS.
- `npm run typecheck:core`: PASS.
- `npm exec tsc -- --noEmit`: PASS.
- `npm run build`: PASS.
- Browser trial on isolated `127.0.0.1:8765`: PASS for three-item import and item 1/item 2 `material_number` preview changes in vector and thermal panes.

## Accepted limitations

- This is an exploration-only local flow. It does not claim production profile/rule parity and does not upload to the server batch endpoint; preview data is sent only through the explicit local render request.
- Dynamic barcode/QR raster images are not regenerated when the active item changes.
- The inspection panel currently shows `Tokens: 0` for literal-resolved dynamic text.
- No printer, live SAP, production database, or port 8000 service was used.
