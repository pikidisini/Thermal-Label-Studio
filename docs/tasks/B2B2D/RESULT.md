# Result — B2B2D

- Status: `IMPLEMENTED_AND_VERIFIED`
- Active writer: `Gemini Flash via Antigravity`
- Branch: `codex/b2b2d-durable-storage-planning`
- Baseline: `a50a142` (`main` setelah B2B2C merged)
- Reviewer: Codex (menunggu review akhir)

## 1. Implementasi Selesai

1. **`DurableFilesystemArtifactStorage`**:
   - Lokasi: `backend/app/print_jobs/artifact_storage.py`
   - Kebijakan retensi: 7 hari (`DEFAULT_RETENTION = timedelta(days=7)`), disetujui pengguna.
   - Atomic staging & fsync: penulisan payload dan `.manifest.json` ke folder `.staging/` dengan UUID unik, `flush()` dan `os.fsync()`, lalu dipindahkan ke lokasi akhir secara atomik menggunakan `os.replace()`.
   - Manifest integrity format v1.0: `schema_version`, `payload_ref`, `filename`, `media_type`, `byte_length`, `sha256`, `created_at`, `retention_expires_at`.
   - Immutability & idempotency: penulisan ulang payload yang identik mengembalikan `ArtifactReference` tanpa error; penulisan ulang dengan konten atau metadata berbeda memicu `ArtifactConflictError`.
   - Fail-closed path traversal & symlink rejection: validasi ketat regex `payload_ref`, penolakan traversal (`..`, `:`, `/`, `\`), penolakan root relatif sebelum resolve, penolakan symlink pada payload dan manifest (`is_symlink()` dan `relative_to(self.root)`).
   - Multiprocess safety: inter-process mutex `_ProcessLock` menggunakan pembuatan direktori atomik di `.staging/` per `payload_ref`, mencegah tabrakan/overwrite antar proses konkuren.
   - Backward compatibility: `TemporaryArtifactStorage` tetap dipertahankan untuk test suite in-memory.

2. **Integrasi Service & API**:
   - `backend/app/print_jobs/service.py`: `PrintJobService` menerima protocol `ArtifactStorage | None`.
   - `backend/app/api/routes_print_agent.py`:
     - `PrintAgentDependencies.artifact_storage` bertipe `ArtifactStorage`.
     - `build_print_agent_dependencies` otomatis menginstansiasi `DurableFilesystemArtifactStorage(Path(resolved_settings.artifact_root), retention=DEFAULT_RETENTION)` ketika mode PostgreSQL aktif.
   - `backend/app/print_jobs/__init__.py`: mengekspor `ArtifactStorage`, `DurableFilesystemArtifactStorage`, `ArtifactManifest`, `DEFAULT_RETENTION`.

## 2. Hasil Pengujian Aktual

- **Unit & Concurrency Tests (`backend/tests/test_durable_artifact_storage.py`)**:
  - `17 passed, 2 skipped` (2 symlink OS tests skipped di Windows non-admin, diverifikasi penuh melalui `test_symlink_mocked_rejection`).
  - Menguji:
    - Atomic write & manifest 7-day retention.
    - Idempotency & conflict detection (different filename, different bytes).
    - Unallowed filenames & path traversal rejection.
    - Integrity verification & tamper detection (payload hash mismatch, length mismatch, manifest sha mismatch, missing manifest).
    - Custom retention policy.
    - Staging directory cleanup.
    - Root relative path rejection (`test_root_relative_path_rejected`).
    - Symlink rejection (`test_symlink_mocked_rejection`).
    - Multiprocess concurrent put same content idempotent (`test_multiprocess_concurrent_put_same_content_idempotent`).
    - Multiprocess concurrent put different content conflict (`test_multiprocess_concurrent_put_different_content_conflict`).
- **PostgreSQL Integration Tests (`backend/tests/test_postgres_print_agent_repository.py`)**:
  - `7 passed` dalam 3.82 detik pada Docker container `postgres:15-bullseye` (`127.0.0.1:55432`).
  - Termasuk `test_postgres_with_durable_artifact_storage_and_manifest_retention`.
- **Targeted Regression Suite**:
  - `144 passed, 2 skipped` dalam 4.19 detik.
- **Lint & Format**:
  - `git diff --check`: 0 whitespace errors.
