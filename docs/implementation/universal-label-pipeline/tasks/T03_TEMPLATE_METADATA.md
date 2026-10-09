# T03 — Define and validate Studio template binding metadata

TASK_ID: T03
Status: PENDING
Depends on: T01, T02
Execution size: One bounded AI task; do not start successors automatically.

## Goal

Create a server-readable, bounded binding specification for real Studio SVG templates without relying on captured preview text/images.

## Prerequisites and context

Read [package README](../README.md), [decisions](../DECISIONS.md), [status](../STATUS.md), root AGENTS.md, active docs and the prerequisite results/reviews.
Re-inspect source and the dirty worktree. This file describes work to implement; it is not evidence of implementation.
Use the T01 frozen CONTRACT.md and PARITY_MATRIX.md when available.

## Files to inspect

- frontend/src/features/canvas/svg/fabricSvgExporter.ts
- frontend/src/features/canvas/svg/fabricSvgImporter.ts
- frontend/src/types/fabric-custom.ts
- frontend/src/features/data-tokens/model/composition.ts
- backend/app/svg_safety.py
- backend/app/labels/layout_contract.py
- backend/app/layouts/service.py
- backend/tests/test_svg_safety.py
- frontend/tests/barcode_payload.mjs

## In scope

Add template_binding models/metadata/validation and implement exporter/importer adjustments required by the agreed specification. Create synthetic shared template fixtures.

## Out of scope

- Unrelated edits, resetting/reformatting existing work, archived-flow restoration, publication or speculative abstractions.
- Actual external-sender access, printer delivery, operational storage initialization/migration, container/deployment effects unless this task explicitly requires and the user authorizes the named target.
- Starting the next task, changing accepted requirements silently or claiming unexecuted gates passed.

## Implementation steps

1. Implement metadata parsing for exact field keys, composition spec, barcode/QR configuration and metadata attached to supported groups/children. Resolve precedence and conflicting declarations explicitly.
2. Generate a binding manifest containing required keys and supported object specs while allowing static templates with no dynamic fields.
3. Bound and validate encoded data-payload-spec JSON, version, shapes and key syntax. Malformed/unsupported metadata in the server output path must fail rather than silently retaining sample output.
4. Preserve physical dimensions/viewBox/transforms, source order, groups, text/tspan and embedded static raster assets. For unsupported geometry/features, produce a bounded validation error.
5. Inspect and repair roundtrip serialization only where needed to preserve the canonical binding spec. Do not rewrite unrelated canvas/UI behavior.
6. Write docs/TEMPLATE_BINDING_CONTRACT.md describing implemented metadata, ownership, rejects and how existing saved SVGs are handled without operational migration.

## Acceptance criteria

- [ ] Every supported dynamic object has a deterministic spec and exact required keys.
- [ ] Wrong case, conflicting metadata, invalid base64/JSON/version and unsafe keys are rejected by the server binding admission.
- [ ] Static-only template is valid; absence of required_facts is not treated as a fixture requirement.
- [ ] Export/import preserve bindings, composition, barcode settings, transforms and static geometry across synthetic roundtrips.
- [ ] Safety validation and semantic binding validation remain explicit separate gates.
- [ ] Old saved SVGs are read according to documented rules, never silently printed as static captured samples when dynamic metadata is invalid.

## Required validation

- Metadata parser tests using actual Fabric-exported synthetic SVG fixtures, including text/tspan, parent metadata, groups, namespace normalization, multiline and rotated objects.
- Export/import regression and invalid-spec tests; inspect fixtures independently of the same metadata generator.
- Size-limit and unsupported-feature tests before rasterization; no database migration or rendering service startup.
- Inspect the actual task-specific diff and run git diff --check on changed files.
- Keep generated test artifacts in a unique project .tmp/ child. Fakes/source checks do not establish live storage/device readiness.
- Report PASS, FAIL, BLOCKED, PENDING and NOT RUN separately, with commands, evidence and limits.

## Risks and escalation

If the binder/API/resource policy cannot meet the frozen contract, record NEEDS_REPLAN and the failing feature.
If a named external authorization is missing, leave only that external gate pending and complete unaffected local work.
For source implementation choices within scope, proceed with documented judgment rather than adding confirmation gates.

## Handoff and stop boundary

Provide the manifest API and supported-feature inventory for T04/T05, and identify any feature requiring NEEDS_REPLAN before output integration.
Write results/T03_RESULT.md using [RESULT_TEMPLATE](../RESULT_TEMPLATE.md); request/record review via [REVIEW_TEMPLATE](../REVIEW_TEMPLATE.md).
Update STATUS.md honestly and stop at this task's boundary.
