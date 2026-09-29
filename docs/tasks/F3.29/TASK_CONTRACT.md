# F3.29 — Table cell text formatting

## Scope

Add spreadsheet-style text formatting for table cells and ranges:

- horizontal alignment: left, center, right;
- font family;
- font size in millimetres;
- bold and italic toggles;
- one compact `Aa` format-menu trigger instead of a row of ambiguous icons;
- right-click on the selected range opens the same format menu.

Formatting must remain part of the versioned `tableSpec` metadata so SVG template export/import preserves it.

## Out of scope

Vertical alignment, text wrapping, cell fill colour, and rich text spans are separate follow-up work.
