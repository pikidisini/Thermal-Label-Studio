# Task review: Txx

- Task/result:
- Reviewer/date:
- Outcome: PASS / CHANGES_REQUIRED / BLOCKED
- Scope reviewed:
- Diff snapshot/HEAD:

## Independent assessment

Read the task, dependencies and actual changed source. Do not accept the writer narrative alone.
Confirm unrelated changes are preserved and inspect task-specific hunks in already-dirty files.

| Acceptance criterion | Evidence inspected/reproduced | Outcome |
| --- | --- | --- |
| | | |

## Required checks

- Contract/schema and documented behavior match.
- Backend gates enforce data/template/target rules; browser checks are not the only authority.
- Missing/null/empty/zero/false and exact keys remain correct.
- Shared engine/binding ownership and no fallback fixture processing.
- Simulation has no print effects.
- One deliberate print submit, correct copies, safe uncertain/replay behavior.
- Meaningful parity tests cover actual Studio templates and data changes.
- Prepared raster pixels match decoded IPL pixels; independent expected codec fixtures guard against shared encoder/decoder mistakes.
- Fake transport or non-device recorder verifies exact prepared payload bytes, one submission and native copies.
- Data Tokens remains editor-only; no automatic print on upload.
- Relevant regressions passed; storage/runtime/device evidence is correctly separated.
- T12 physical acceptance is optional; its NOT RUN status does not block software acceptance or imply device readiness.
- Raw data/credentials are absent from logs and committed files.

## Findings

List actionable findings with file/line, consequence and required correction.
A PASS applies only to the task's verified scope, not to pending integration or production gates.

## Next action

State whether the next dependent task can begin and what remains blocked.
