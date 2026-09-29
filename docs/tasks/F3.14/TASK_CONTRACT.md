# F3.14 — Local SAP JSON to Designer Preview

## Scope

Add a local-file exploration path from a local SAP JSON file to the existing SAP token drawer and visual designer preview. Parsing and state selection happen in the browser; selecting Preview sends the current contract to this application's local render service. Support the existing v1.1 `{fields,codes,source}` contract and raw v2 item snapshots with scalar characteristics and business context.

## Constraints

- Maximum file size is 2 MiB and item/characteristic counts are bounded.
- Parsed data remains in browser memory until sent for the explicit local render preview request; there is no localStorage, automatic batch upload, printer, SAP, or production database call.
- Invalid imports preserve the last valid local contract.
- Raw v2 values are displayed exactly, including null and empty string. No production N001 rules, derived barcodes, or automatic canvas replacement are introduced.
- Field names outside the current renderer token grammar remain visible but cannot be inserted as preview tokens.

## Acceptance

- Valid local JSON updates the in-memory contract store and token drawer.
- Raw v2 item selection changes token values without changing canvas objects.
- Preview remains explicitly entered through the existing Preview mode.
- Parser tests cover supported formats and rejection boundaries.
