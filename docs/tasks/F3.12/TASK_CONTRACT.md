# F3.12 / A08 — incremental strict frontend typing

- Writer: Luna Low
- Reviewer/advisor: Codex reviewer
- Scope: immutable selection DTO and a narrow strict TypeScript gate.

The store replaces `Record<string, any>` for selected object properties with `SelectionPropsDto`. The dedicated gate compiles the pure DTO under strict/noUnused settings without masking missing third-party declarations. Do not flip global strict or add blanket module declarations.
