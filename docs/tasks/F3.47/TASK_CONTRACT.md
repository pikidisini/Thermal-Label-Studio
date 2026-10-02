# F3.47 — Controlled UI migration: Print and Export

Scope only `features/print/ui/PrintModal.tsx`, `DirectTcpTab.tsx`, `SpoolerTab.tsx`, and `FileExportTab.tsx`. Adopt shared UI primitives/configured semantic tokens and English copy while preserving all tabs, role/hardware gates, IDs, format selection, export/download, and transport behavior.

No backend/endpoints/auth/store/security/hardware policy changes. Do not invoke printer/spooler/port actions. No commit/push/deploy/restart.
