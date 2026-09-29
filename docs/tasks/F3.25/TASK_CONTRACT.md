# F3.25 Table visual editing

## Scope

Improve the existing bounded `tableSpec` editor without changing print, MinIO,
authentication, or deployment behavior:

- resize internal table boundaries directly on the canvas;
- edit a cell's literal preview text with a double-click;
- provide spreadsheet-style border presets while keeping the Props panel as a
  precise fallback.

## Acceptance

- A selected unrotated table exposes draggable column and row boundary handles.
  A drag changes only the affected millimeter dimension, stays within the
  existing `tableSpec` bounds, preserves the table group and transform, and is
  captured by history/render simulation.
- Double-clicking a cell opens an inline editor for the hit cell. Enter or blur
  commits a bounded literal text value, Escape cancels, and an existing cell
  token remains unchanged.
- Border controls can target a cell, row, column, or table and apply outer,
  inner, all, or explicitly selected sides with none/solid/dashed style and a
  bounded width. Shared interior edges remain synchronized.
- SVG export/import and editor draft serialization retain the table metadata;
  unrelated canvas objects remain unrelated.
- No arbitrary code, network, printer, or deployment behavior is introduced.
