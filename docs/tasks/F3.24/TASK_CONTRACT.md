# F3.24 Table model and editor controls

## Acceptance
- Table is a single Fabric group with a bounded, versioned declarative `tableSpec`.
- Rows/columns and their millimeter sizes are editable; each cell has literal preview text or an allowlisted token, and each cell edge has none/solid/dashed plus width.
- Shared interior edges are synchronized in the inspector and emitted once to avoid double strokes.
- SVG output retains ordinary vector geometry and carries encoded table metadata for editing after import; cell text carries renderer-compatible `data-placeholder` binding metadata.
- Table settings survive Fabric JSON/draft serialization.
- Layers can group 2–50 selected ordinary objects and ungroup ordinary groups; table groups stay intact and cannot be ungrouped through the generic action.
- No executable expressions or network/printer/deployment behavior is introduced.

## Storage and bounds
`tableSpec` v1 stores rows, cols, `columnWidthsMm`, `rowHeightsMm`, and cells with text/token and four edge values. Parser caps dimensions to 20x20, text to 160 chars, token syntax/length, widths/heights, and edge widths. Malformed/unknown versions are rejected.
