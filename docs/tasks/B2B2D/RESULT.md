# Result — B2B2D

- Status: `IMPLEMENTED_AND_VERIFIED`
- Active writer: `Gemini Flash via Antigravity`
- Branch: `codex/b2b2d-durable-storage-planning`
- Baseline: `a50a142` (`main` setelah B2B2C merged)
- Reviewer: Codex (menunggu review akhir)

## 1. Implementasi Selesai

1. **`DurableFilesystemArtifactStorage`**:
   - Lokasi: `backend/app/print_jobs/artifact_storage.py`
   - Kebijakan retensi default: 7 hari (`DEFAULT_RETENTION = timedelta(days=7)`).
   - Atomic staging & fsync: penulisan payload dan `.manifest.json` ke folder `.staging/` dengan UUID unik, `flush()` dan `os.fsync()`, lalu dipindahkan ke lokasi akhir secara atomik menggunakan `os.replace()`.
   - Manifest integrity format v1.0: `schema_version`, `payload_ref`, `filename`, `media_type`, `byte_length`, `sha256`, `created_at`, `retention_expires_at`.
   - Immutability & idempotency: penulisan ulang payload yang identik mengembalikan `ArtifactReference` tanpa error; penulisan ulang dengan konten atau metadata berbeda memicu `ArtifactConflictError`.
   - Fail-closed path traversal: validasi ketat regex `payload_ref`, penolakan traversal (`..`, `:`, `/`, `\`), dan verifikasi path containment terhadap root.
   - Backward compatibility: `TemporaryArtifactStorage` tetap dipertahankan untuk test suite in-memory.

2. **Integrasi Service & API**:
   - `backend/app/print_jobs/service.py`: `PrintJobService` menerima protocol `ArtifactStorage | None`.
   - `backend/app/api/routes_print_agent.py`:
     - `PrintAgentDependencies.artifact_storage` bertipe `ArtifactStorage`.
     - `build_print_agent_dependencies` otomatis menginstansiasi `DurableFilesystemArtifactStorage(Path(resolved_settings.artifact_root), retention=DEFAULT_RETENTION)` ketika mode PostgreSQL aktif.
   - `backend/app/print_jobs/__init__.py`: mengekspor `ArtifactStorage`, `DurableFilesystemArtifactStorage`, `ArtifactManifest`, `DEFAULT_RETENTION`.

## 2. Hasil Pengujian Aktual

- **Unit Test Baru (`backend/tests/test_durable_artifact_storage.py`)**:
  - `13 passed` dalam 0.63 detik.
  - Menguji atomic write, manifest 7-day retention, idempotency, conflict detection, unallowed filenames, integrity verification, tamper detection (corrupted payload, length, sha, missing manifest), path traversal rejection, custom retention, dan staging cleanup.
- **PostgreSQL Integration Tests (`backend/tests/test_postgres_print_agent_repository.py`)**:
  - `7 passed` dalam 4.98 detik pada Docker container `postgres:15-bullseye` (`127.0.0.1:55432`).
  - Termasuk `test_postgres_with_durable_artifact_storage_and_manifest_retention` yang membuktikan end-to-end integrasi database dan durable filesystem storage.
- **Targeted Regression Suite**:
  - `140 passed` dalam 3.10 detik (`test_durable_artifact_storage.py`, `test_print_agent_api.py`, `test_local_print_agent.py`, `test_print_job_v1.py`).
- **Full Backend Suite**:
  - `189 passed, 0 failed` dalam 35.39 detik.
- **Lint & Format**:
  - `git diff --check`: 0 whitespace errors.
