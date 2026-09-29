# F3.24 Advisor review

Status: **PASS for the requested local editor flow**.

The table is represented as one bounded Fabric group with a versioned `tableSpec`. The inspector edits row/column counts, each row and column dimension, one selected cell's literal preview/token, and its four edge styles. Shared interior edges mirror the adjacent cell and are emitted once by the table builder. The Layers panel keeps the table as one logical object and can expand its cells. Ordinary multi-selection can be grouped and ordinary groups can be ungrouped; table groups are protected from generic ungroup so their editable model is retained.

The SVG path was reviewed after the first browser run found that nested Fabric groups were flattened on import. The importer now walks ancestor groups, assigns each marked source group a unique key, and rebuilds only the marked children. The verified browser case contains two different tables plus unrelated text and confirms both tables remain separate after import. The renderer contract confirms a cell with `data-placeholder` resolves from JSON while an unbound literal remains unchanged.

Evidence: `npm run typecheck:core` passed; `npm test` passed with 104 tests; `npm run build` passed after transforming 1,848 modules; the focused Playwright test passed 2/2; and the focused backend renderer test passed 1/1 with two existing deprecation warnings.

Remaining boundaries: the full Playwright suite was not run, and physical printer output was not exercised. The generic group action is intentionally bounded to 2–50 ordinary objects. Table dimensions and text/token inputs are bounded by `tableSpec` validation; unsupported or malformed table metadata remains ordinary SVG geometry rather than being executed.
