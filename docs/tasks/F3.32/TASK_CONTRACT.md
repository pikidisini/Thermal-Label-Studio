# F3.32 — Line drawing and hidden table creation

## Scope
Hide table creation from the toolbox while preserving legacy table import/edit, and provide feature-owned click-drag line drawing with endpoint and style editing.

## Acceptance criteria
- Table creation trigger is absent from the design toolbox.
- Selecting the line tool creates no object until a meaningful mouse gesture completes.
- Horizontal and diagonal lines preview and commit; zero-length, Escape, blur, pointer-cancel, and tool-switch gestures leave no transient layer/history entry.
- Selected lines expose endpoint, color, width, and solid/dashed/dotted controls.
- Endpoint updates preserve the existing moved/rotated canvas pose.

## Boundaries
Frontend only. No printer, SAP, production, deployment, commit, or push.
