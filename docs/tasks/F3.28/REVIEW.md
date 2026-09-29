# F3.28 Review

Review focus covered the table model, rendering, contextual actions, and browser interaction. Spans are bounded to the existing 20x20 table dimensions and malformed or overlapping rectangles are rejected. Merge preserves the anchor cell text/token and leaves covered cell records intact; split resets only the anchor span. Existing SVG export/import uses the existing encoded tableSpec metadata, so span state is serialized with the same mechanism.

The original interaction conflict was confirmed: Fabric began moving the selected table while the user attempted to drag a cell range. The implemented range gesture temporarily locks that table's movement and restores its former movement flags on pointer release. This gives the user spreadsheet-style range selection without permanently altering the object's move configuration.

Validation: strict frontend typecheck PASS; `npm test` PASS (21 tests); targeted Chromium Playwright PASS (5 tests), including the dragged 2x2 merge/split case; diff whitespace check PASS. The targeted browser suite retains the existing SVG round-trip case for normal per-cell bindings. No test covers structural insertion/deletion after a merged span; that operation remains outside this F3.28 slice.
