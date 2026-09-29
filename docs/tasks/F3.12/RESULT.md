# F3.12 / A08 — hasil increment

Status: PARTIAL / READY FOR REVIEW

Added `SelectionPropsDto` as a typing seed and replaced the studio store's selection property map type. Added `npm run typecheck:core` with strict/noUnused settings over the DTO and production `useHistoryStore`, and wired it into the Jenkins frontend stage. The DTO is not yet populated by the canvas selection pipeline; it is not a completed runtime boundary. Global strict remains false and existing canvas/API `any` usage is unchanged.

Verification: `npm run typecheck:core` is the intended strict gate for this increment. Full strict migration, Fabric typing, API contract typing, and inspector/canvas conversion remain future A08 work.
