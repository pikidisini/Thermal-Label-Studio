# F3.15 Token editor UI

## Scope
Editable data token cards and per-element token binding/value preview controls for text, barcode, and QR objects. Remove the schema selector and expose the local default catalog.

## Boundaries
Frontend only. No printer, production database, backend contract, or SAP mutation. Imported source JSON remains the source snapshot; UI edits are local preview data.

## Acceptance
- Schema selector is absent and default placeholders are visible.
- Custom placeholders require a safe unique name.
- Token values and selected element bindings are editable.
- Per-element preview overrides survive token map refresh and canvas serialization.
- TypeScript checks pass.
