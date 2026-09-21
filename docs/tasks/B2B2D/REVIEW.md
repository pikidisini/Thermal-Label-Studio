# Review — B2B2D

- Reviewer: `Gemini Flash via Antigravity (Principal Security Reviewer & Staff Systems Architect, dialihkan dari Codex)`
- Status: `APPROVED`
- Verdict: `READY_FOR_MERGE`
- Branch: `codex/b2b2d-durable-storage-planning`
- Baseline: `origin/main` pada commit `a50a142` (B2B2C merged)

## 1. Audit Mendalam Temuan P1 & Resolusi

1. **P1 — Validasi Containment `.staging` dan Reparse/Junction/Symlink Rejection**:
   - *Analisis Keamanan*: Pada OS Windows, NTFS Directory Junction (`IO_REPARSE_TAG_MOUNT_POINT`) tidak terdeteksi oleh `pathlib.Path.is_symlink()`. Jika folder `.staging` atau storage root dialihkan via junction ke lokasi eksternal (symlink injection/directory traversal), file staging dapat keluar dari boundary storage tepercaya.
   - *Evaluasi Implementasi*:
     - Helper `_is_reparse_or_link(path)` menggunakan kombinasi `path.is_symlink()` dan `os.readlink(path)` (yang pada Python 3.8+ Windows mendukung junction point), mengembalikan `True` jika path berupa symlink maupun junction.
     - Konstruktor `DurableFilesystemArtifactStorage` memeriksa `_is_reparse_or_link` pada `self.root` serta `self.staging_dir` baik sebelum maupun setelah pembuatan direktori.
     - Pengecekan sekunder *defense-in-depth* `self.staging_dir.resolve() != self.root / ".staging"` memastikan bahwa resolusi path kanonikal tidak pernah keluar dari direktori root.
     - Penolakan symlink pada `_path_for()` dan `_manifest_path_for()` memastikan payload dan manifest final tidak dapat dieksploitasi via symlink.
   - *Hasil Pengujian*:
     - `test_staging_directory_windows_junction_rejected`: Terverifikasi menolak junction NTFS nyata yang dibuat via Windows `mklink /J`.
     - `test_staging_directory_containment_fallback_rejected`: Terverifikasi menolak path yang resolusinya keluar dari storage root.

2. **P1 — OS-Level Inter-Process Lock `_ProcessLock` tanpa Mtime Takeover**:
   - *Analisis Sistem & Konkurensi*: Pendekatan penguncian file berbasis umur file (`mtime > 30s`) memiliki cacat fatal (*TOCTOU / stale lock race*): jika sebuah proses writer mengalami latensi I/O tinggi, memory paging, atau GC pause, proses lain dapat secara keliru menganggap lock mati, menghapus direktori lock, dan menimpa artefak yang sedang ditulis secara konkuren.
   - *Evaluasi Implementasi*:
     - Mekanisme lock dirombak total menjadi OS-level file descriptor lock:
       - Windows: `msvcrt.locking(fd, msvcrt.LK_NBRLCK, 1)` (non-blocking exclusive byte lock pada offset 0).
       - POSIX / Linux: `fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)` (non-blocking exclusive advisory lock).
     - File lock dibuka dengan mode `"a+b"` sehingga tidak memotong (*truncate*) file yang sedang di-lock proses lain.
     - Kepemilikan lock dijamin langsung oleh kernel sistem operasi. Jika proses terminasi normal ataupun crash/SIGKILL, kernel OS secara otomatis melepaskan file descriptor lock tersebut seketika.
     - Mekanisme *mtime takeover* dihapus sepenuhnya.
     - Saat batas `timeout` tercapai (default 10s), proses yang gagal mendapatkan lock langsung *fail-closed* (`raise TimeoutError`) dan menutup handle filenya tanpa memodifikasi, memotong, atau menghapus (*unlink*) file lock milik proses aktif.
   - *Hasil Pengujian*:
     - `test_multiprocess_live_owner_with_aged_timestamp_cannot_be_taken_over`: Terverifikasi bahwa owner lock aktif yang timestamp-nya sengaja diubah ke epoch 0 (1970) tidak dapat direbut oleh writer kedua, dan writer kedua mengalami timeout fail-closed tanpa menghapus lock file aktif.
     - `test_multiprocess_concurrent_put_same_content_idempotent`: Terverifikasi 2 proses konkuren menulis ref identik secara atomik dan idempotent.
     - `test_multiprocess_concurrent_put_different_content_conflict`: Terverifikasi 2 proses konkuren menulis ref yang sama dengan konten berbeda menghasilkan tepat 1 sukses dan 1 `ArtifactConflictError`.

## 2. Pemenuhan Acceptance Criteria (TASK_CONTRACT.md)

- **AC 1 (Storage boundary)**: `ArtifactStorage` didefinisikan sebagai protocol independen (`put`, `read_verified`, `checksum`), memisahkan `DurableFilesystemArtifactStorage` dari storage in-memory/test tanpa mengubah kontrak publik `PrintJob v1`. (STATUS: `VERIFIED`)
- **AC 2 (Path traversal & boundary validation)**: Root divalidasi absolut, penolakan karakter URL/traversal (`/`, `\`, `:`, `?`, `#`), penolakan symlink dan directory junction pada root, staging, payload, dan manifest. (STATUS: `VERIFIED`)
- **AC 3 (Atomic publish & fail-closed)**: Payload dan manifest ditulis ke `.staging/` dengan UUID acak unik, di-flush dan di-`fsync` ke disk, lalu di-publish atomik menggunakan `os.replace()`. Pembaca tidak pernah menerima state parsial. (STATUS: `VERIFIED`)
- **AC 4 (Immutability & idempotency)**: Penulisan ulang dengan konten dan metadata identik mengembalikan `ArtifactReference` yang sama (idempotent); penulisan ulang dengan filename, ukuran, atau bytes berbeda menghasilkan `ArtifactConflictError`. (STATUS: `VERIFIED`)
- **AC 5 (read_verified integrity check)**: Validasi manifest schema, payload_ref, filename, media type, byte length, dan SHA-256 dilakukan secara ketat sebelum bytes dikembalikan ke caller. (STATUS: `VERIFIED`)
- **AC 6 (Integrasi opt-in PostgreSQL)**: Mode PostgreSQL persistence menggunakan durable storage adapter yang terkonfigurasi; startup fail-closed jika konfigurasi root tidak valid; backward compatibility dengan memory/test suite tetap terjaga. (STATUS: `VERIFIED`)
- **AC 7 (Quality gate & dokumentasi)**: Seluruh test unit, konkurensi multiproses, integrasi PostgreSQL disposable, dan targeted regression lulus; `git diff --check` bersih (0 whitespace errors); 0 secrets. (STATUS: `VERIFIED`)

## 3. Verifikasi Reviewer Aktual

- `PASS`: 20 unit/concurrency test passed, 2 skipped (symlink OS non-admin) pada `backend/tests/test_durable_artifact_storage.py`.
- `PASS`: 7 PostgreSQL integration test passed pada disposable container `postgres:15-bullseye` (`backend/tests/test_postgres_print_agent_repository.py`).
- `PASS`: 147 targeted backend regression test passed, 2 skipped.
- `PASS`: 196 full backend suite passed, 2 skipped (31.34s) pada container database disposable aktif.
- `PASS`: `git diff --check` lulus (0 whitespace errors).
- `PASS`: Secret scan lulus (0 secrets / credentials).

## 4. Catatan Arsitektur & Operasional (Lean Pilot)

1. **Kebijakan Retensi**: Retensi artefak 7 hari (`DEFAULT_RETENTION = timedelta(days=7)`) telah tertanam pada metadata manifest (`retention_expires_at`). Sesuai scope kontrak, daemon penghapusan otomatis (*retention cleanup daemon*) berada di luar scope B2B2D dan akan diimplementasikan pada fase lifecycle tersendiri.
2. **Permission Filesystem**: Pada deployment server Linux intranet nantinya, direktori root durable storage harus diatur dengan permission ketat (`chmod 700 / chown app:app`) agar hanya user proses aplikasi yang memiliki akses read/write.

## 5. Kesimpulan & Langkah Berikutnya

Implementasi B2B2D beserta dua resolusi P1 telah diaudit secara formal dan memenuhi standar keandalan, keamanan, dan konkurensi enterprise.

- **Verdict**: **`APPROVED`** / **`READY_FOR_MERGE`**
- **Langkah berikutnya**: Menunggu persetujuan pengguna untuk melakukan squash merge branch `codex/b2b2d-durable-storage-planning` ke `main`.
