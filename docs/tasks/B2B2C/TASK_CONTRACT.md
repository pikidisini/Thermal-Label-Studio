# Task Contract — B2B2C

## Identitas

- Status: `PAUSED_AFTER_SAFE_CHECKPOINT`
- Risk level: `3`
- Branch: `codex/b2b2c-postgresql-persistence`
- Planner/final reviewer: Codex Sol High
- Pre-reviewer: Codex Terra
- Intended executor: Gemini Flash via Antigravity
- Active writer: `NONE — safe checkpoint pushed; assign one writer before edits`

## Tujuan

Mengimplementasikan persistence layer PostgreSQL B2B2C secara transaksional untuk print pipeline tanpa mengubah kontrak bisnis cetak yang sudah disepakati.

## Scope

### Termasuk

- Migration/schema bootstrap yang sesuai DDL yang telah diverifikasi.
- Repository PostgreSQL untuk lifecycle print job, claim, lease, fencing, outbox, dan audit.
- Durable artifact storage yang sesuai boundary kontrak.
- Integrasi dependency FastAPI yang fail-closed.
- Test unit dan integration pada PostgreSQL disposable.
- Dokumentasi operasi dan handoff.

### Tidak termasuk

- Database production atau credential perusahaan.
- Printer fisik, TCP port 9100, Windows Spooler, atau transport printer nyata.
- RabbitMQ, MinIO, Kubernetes, dan deployment production.
- Safe Demo Mode dan perubahan UI di luar kebutuhan kontrak persistence.
- Merge ke `main` tanpa persetujuan pengguna.

## Batas keamanan

- Satu writer aktif pada branch.
- Network I/O printer tidak boleh terjadi di dalam transaksi database.
- Status `sending` tidak boleh auto-requeue.
- Perubahan schema harus memiliki rollback/test pada PostgreSQL disposable.
- Jangan menyimpan secret atau connection string nyata di repository.

## Acceptance criteria

1. Ingestion/idempotency tersimpan atomik di PostgreSQL.
2. Claim per printer dan fencing token aman terhadap dua worker concurrent.
3. Lifecycle, lease expiry, callback result, dan outbox mematuhi state machine.
4. Artifact durable diverifikasi checksum, byte length, dan immutability.
5. Restart proses tidak menghilangkan state persisted.
6. Test unit, integration PostgreSQL, full backend, dan quality gate relevan lulus.
7. Dokumentasi, RESULT, REVIEW, commit, dan PR menjelaskan bukti aktual serta risiko tersisa.

## Handoff

Safe checkpoint `b1c5a6a` sudah dipush ke branch ini. Setelah Gemini ditetapkan sebagai writer, Gemini membaca contract ini, mengerjakan acceptance criteria yang tersisa, mengisi `RESULT.md`, lalu berhenti sebelum merge.
