# F3.17 Result

Implemented in `frontend/src/components/layout/TopMenuBar.tsx`, `AuthenticatedStudio.tsx`, `renderApi.ts`, and `validateLocalSvg.ts`. SVG validation rejects active content, external references, invalid dimensions, and oversized input. JSON upload uses the existing local parser.

Verification: `npm run typecheck:core` PASS. Root reports frontend tests 96/96 PASS and build PASS. Browser review confirmed File/Edit/View/Help menus open, JSON upload succeeds (item 1/3), a 406-byte SVG imports with canvas/dimension update, and invalid root `onload` preserves the canvas. Filesystem evidence in `C:/Users/fiqih/Downloads` confirms `thermal-template.svg` is valid 200x80mm and `thermal-rendered (1).svg` is 788 bytes with `SYN-MAT-0001` and no unresolved placeholder. Browser download event API timed out, but the downloaded files were verified on disk. Fixed Fabric import handling for a single embedded raster image: `groupSVGElements` can return one Fabric object, so the importer now supports both group and single-object results. Final browser retest confirms the valid embedded PNG fixture imports successfully, displays the black square, and updates canvas dimensions from 200x80 to 20x20mm. Large-template transfer remains NOT RUN.

## Add Text binding roundtrip follow-up

The downloaded file reported by the user (`thermal-template (1).svg`) contained
only the resolved preview text (`PFO-30`) and a Fabric DOCTYPE preamble; it had
no binding metadata, so the application cannot infer that it was intended to
represent `material_number`. The exporter now serializes an explicit inspector
binding (`dataField`) as both `data-field="material_number"` metadata and one
literal `{{material_number}}` placeholder, while leaving the live Fabric object
resolved for preview. Static Add Text objects remain unchanged. Fabric 5 does
not reliably serialize custom properties through `propertiesToInclude`, so the
implementation temporarily wraps each object's `toSVG` method, injects the
metadata into that object's markup, and restores the original method in
`finally`. The output suppresses the DOCTYPE so the safe importer can accept it.

The importer now hydrates a bound text object from the active token map after
re-import. It displays `SR01PFO3000810` when available, while retaining
`dataField="material_number"` for the inspector and the next template export;
missing fields remain placeholders.

Verification: root browser review passed for Add Text → inspector binding →
template download (`thermal-template (2).svg` contains `data-field` and one
`{{material_number}}`, with no DOCTYPE), rendered download (`thermal-rendered
(2).svg` contains `SR01PFO3000810`), re-import preview hydration, preserved
inspector binding, and static Add Text export. `npm run typecheck:core` PASS,
frontend build PASS, npm test 96/96 PASS, and `git diff --check` PASS. No
commit or push was performed.
