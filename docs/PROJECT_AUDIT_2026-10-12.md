# Global documentation audit

Date: 2026-10-12 (Asia/Jakarta). Scope: inspect current checkout/source/status,
refresh workspace/application guidance and execute source validation plus
read-only runtime probes. This is dated evidence; ongoing implementation
acceptance remains owned by [pipeline status](implementation/universal-label-pipeline/STATUS.md).

## Findings and repairs

- Parent README pointed at retired web_app; it now selects Thermal-Label-Studio,
  describes sibling SAP-Simulator and archived material, and distinguishes Git roots.
- Added parent AGENTS.md for repository selection and shared authorization/data boundaries.
- Application README no longer describes implemented Studio print/shared output
  and intake source as absent. It distinguishes those capabilities from mandatory
  resource/runtime/security and physical acceptance still outstanding.
- Application AGENTS.md now includes canonical data, template metadata/binding,
  engine/intake ownership, fail-closed ledger/policy and current acceptance limits.
- CONTRIBUTING.md aligns locale rules, command directories and validation scope.
- DEVELOPMENT.md corrects the checkout path and documents background process
  ownership/recovery, storage-enabled restart and separate intake startup settings.
- Architecture's top-level map includes binding/intake/datasets and distinguishes
  HTTP intake source from actual activated SAP ECC integration.

Existing source/configuration changes and task result history were preserved.
No source behavior, operational storage, service lifecycle, Git history or remote
was changed by this documentation audit. Source validation regenerates frontend
dist and disposable reports. No new independent reviewer was used.

## Current verification

| Gate | Result | Evidence and scope |
| --- | --- | --- |
| Backend regression | PASS | Existing source gate, exit 0 |
| Full frontend TypeScript | PASS | Existing source gate, exit 0 |
| Fresh frontend build | PASS | Existing source gate, exit 0 |
| Frontend regression | PASS | Existing source gate, exit 0 |
| Documentation links and changed-document whitespace | PASS | Local targets checked; no Git whitespace errors |
| Studio :5173, backend health/ready :8000 | PASS | Read-only HTTP 200 probes |
| Layout list through Vite proxy | PASS | GET /api/v1/layouts HTTP 200; no storage writes |
| Browser interaction and Save/Open writes | NOT RUN | HTTP probes do not establish browser acceptance |
| Image build/Linux rendering/rollback | NOT RUN | Source gate retains deployment_ready=false |
| New quality scan/Jenkins execution | NOT RUN | Existing services do not establish a current gate |
| SAP sender/intake replay and physical printer | NOT RUN | Current historical checkpoints preserved; no sends in this audit |

Command: `python -B scripts/check_project.py --run-source-checks`.
Disposable report: `.tmp/source-checks-c5a491a8-ab89-47f9-9442-05bb7497e838/report.json`.
The report may be cleaned later; the scope/outcome above remains the audit record.
Its runtime NOT RUN fields belong to that source-only process; HTTP probes above
are separate limited evidence and do not upgrade its browser/packaging gates.

Observed running services: application PostgreSQL/MinIO, Jenkins, SonarQube and
its database, plus the shared Sonar MCP bridge. The packaged app was not in the
running container list; development frontend/backend responded locally.
This observation is not a persistent service-status guarantee.

T06 remains BLOCKED for its declared browser gate, T07/T10/T11 NEEDS_REPLAN,
and optional T12 physical acceptance BLOCKED according to current status.
No aggregate production or complete pipeline acceptance is claimed.
