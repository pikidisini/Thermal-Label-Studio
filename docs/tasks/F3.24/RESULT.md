# F3.24 Result

Implemented `tableSpec` v1 with bounds, per-cell content and border controls, variable rows/columns/sizes, a single Fabric table group, layer expansion, draft serialization, nested cell token SVG attributes, and encoded SVG metadata that importer reads to preserve each group. Layers also has bounded ordinary group/ungroup actions; generic ungroup is disabled for tables.

## Checks
- `npm run typecheck:core`: PASS.
- `npm test`: PASS, 104 tests (including the new table spec and shared-border regression checks).
- `npm run build`: PASS (1,848 modules).
- `npm run typecheck:core`: PASS.
- `backend/tests/test_renderer_table_contract.py`: PASS, 1 test and 2 existing deprecation warnings.
- `frontend/tests/table_editor.spec.js`: PASS, 2 Playwright tests (authentication setup plus table editing/SVG roundtrip). The first run exposed a real importer defect where nested table children were flattened; the importer was corrected to find metadata through ancestor groups and rebuild each table independently. The rerun passed.
- SVG roundtrip preserves two separate tables and unrelated text; the edited non-first cell, shared dashed border, cell placeholder, and table dimensions were verified in the browser.

## Additional integration checks
- `frontend/tests/table_editor.spec.js`: authenticated Playwright coverage for cell edits, shared edges, layers, SVG download and multi-table import with unrelated text; escalated execution passed.
- `backend/tests/test_renderer_table_contract.py`: bound cell text resolves and keeps unrelated literal text intact; execution passed.
- `data-editor-group="true"` now marks generic editor groups in SVG and importer restores those nested groups separately from table metadata.

## Limits
Full Playwright suite and physical browser/printer checks were not run. General group/ungroup is bounded to 2–50 ordinary objects; tables are excluded from generic ungroup so their editable table model is not accidentally destroyed.
