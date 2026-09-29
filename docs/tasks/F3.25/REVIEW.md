# F3.25 Advisor review

Status: **PASS for the requested local table editor flow**.

The implementation keeps `tableSpec` as the source of truth. Drag handles
rebuild the same logical Fabric table group with bounded row or column sizes;
they do not flatten the table into unrelated canvas objects. Double-click hit
testing uses the table geometry, and the inline editor commits through the same
table rebuild path, so token metadata and SVG roundtrip behavior remain intact.

The border palette is a declarative wrapper around the existing shared-edge
model. Applying a preset updates both representations of an interior line,
which prevents the two adjacent cells from disagreeing. The manual Props
controls remain available for users who need exact values.

Evidence: core TypeScript checking, the 105-test frontend suite, the Vite
production build, and the focused authenticated Playwright suite all passed.
The Playwright suite verified visual boundary resizing, border presets, inline
commit/cancel, grouped layers, SVG export/import, and preservation of an
unrelated object. Physical printer output and the full browser suite were not
run.
