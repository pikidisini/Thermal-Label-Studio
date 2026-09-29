# F3.29 Review

The implementation keeps cell formatting in the table model instead of relying only on Fabric child-object state. This means a table rebuilt after a range action and a table serialized into SVG retain the same formatting metadata. Applying a range format updates each cell record independently, while merged cells continue to render only their anchor record.

The compact menu reduces the visual load of the table toolbar. Right-click is supported on the blue selection overlay and is handled locally so the browser context menu does not replace the editor menu. Bold and italic are reversible toggles; alignment, font, and size actions are explicit choices.

The current slice does not implement vertical alignment, wrapping, fill colour, or mixed-value indicators for a range. Those should be added only after the core cell-format interaction is validated with operators.

Follow-up review: the previous long popup was visible on first selection
because inline `display:grid` overrode the `hidden` attribute. The compact
menu uses explicit `display:none`/`display:block`, opens by button or right
click, and groups commands behind collapsible sections. The helper is the
first feature-local extraction. Further folder moves should follow the
architecture plan rather than a bulk rename across the dirty worktree.
