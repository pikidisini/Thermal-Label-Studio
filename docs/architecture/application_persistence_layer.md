# Application Persistence Layer B2B2C

Status: **IMPLEMENTED AND DISPOSABLE-POSTGRESQL-VERIFIED**

Target: PostgreSQL 15+ pada server Linux intranet
Production deployment: **NOT RUN**

## 1. Tujuan dan batas fase

Fase B2B2C menghubungkan Print Agent HTTP API dengan PostgreSQL untuk lifecycle
delivery yang sudah memiliki kontrak stabil:

```text
queued -> claimed -> sending -> sent_to_printer | failed | delivery_unknown
```

Implementasi ini tidak berpura-pura menyelesaikan semua persistensi produk.
Batch ingestion dari SAP, render worker persistence, admin printer registry,
retention worker, role database produksi, backup/restore, dan printer transport
fisik tetap berada di fase berikutnya.

## 2. Komponen yang diimplementasikan

- `PostgresPrintAgentRepository`: adapter sinkron berbasis `psycopg` connection
  pool untuk operasi claim, lease reconciliation, begin delivery, result callback,
  audit, dan transactional outbox.
- `PrintAgentRepository`: interface sempit untuk HTTP Print Agent. Repository
  memory tetap mengimplementasikan superset untuk test/pilot lokal.
- `migrations.py`: runner baseline eksplisit dengan advisory transaction lock dan
  checksum. Migrasi tidak pernah dijalankan otomatis saat FastAPI startup.
- `X-Print-Claim-Token`: fencing token wajib pada download artifact,
  begin-delivery, dan result callback. Token bukan credential, tetapi generation
  number untuk menolak stale worker.
- Durable artifact root: mode PostgreSQL wajib menggunakan direktori trusted
  dari `PRINT_AGENT_ARTIFACT_ROOT`; temporary directory tidak digunakan.
- Persistent artifact sidecar: filename dan checksum disimpan bersama payload
  agar immutable/idempotent `put()` tetap dapat diverifikasi setelah restart.

## 3. Konfigurasi fail-closed

Mode default tetap in-memory dan API tetap default disabled. PostgreSQL hanya
aktif bila dipilih eksplisit:

```text
PRINT_AGENT_API_ENABLED=true
PRINT_AGENT_REPOSITORY_BACKEND=postgresql
PRINT_AGENT_DATABASE_URL=<secret dari secret manager/environment>
PRINT_AGENT_ARTIFACT_ROOT=<absolute trusted durable directory>
PRINT_AGENT_DATABASE_POOL_MIN_SIZE=1
PRINT_AGENT_DATABASE_POOL_MAX_SIZE=4
```

Bearer token, database URL, dan credential nyata tidak boleh disimpan di Git.
Mode PostgreSQL menolak startup bila database URL, durable artifact root, pool
setting, atau baseline schema tidak valid.

## 4. Strategi migrasi

Baseline SQL yang direview tetap berada di
`docs/database/print_pipeline_v1.sql`. Operator menjalankan migration command
secara eksplisit setelah mengisi `PRINT_AGENT_DATABASE_URL`:

```powershell
python -m backend.app.print_jobs.migrations apply
python -m backend.app.print_jobs.migrations verify
```

Runner membuat `thermal_label_schema_migrations`, mengambil PostgreSQL advisory
transaction lock, menolak object skema yang ada tanpa migration record, dan
menolak checksum yang berubah. Menjalankan `apply` kedua kali terhadap baseline
yang identik adalah no-op terverifikasi. Perubahan skema berikutnya harus dibuat
sebagai migration versi baru; jangan mengedit baseline yang sudah terpasang.

## 5. Transaksi dan concurrency

Aturan lock untuk lifecycle delivery:

1. Reconcile expired lease/job dalam transaksi singkat.
2. Lock `printer_dispatch_state` dan kandidat `print_jobs` dengan
   `FOR UPDATE ... SKIP LOCKED`.
3. Increment `fencing_generation`, simpan claim, lalu commit.
4. Download artifact dan printer/network I/O terjadi di luar transaksi database.
5. `begin_delivery` dan `report_result` kembali mengambil lock printer/job,
   memverifikasi `agent_id` serta fencing token, melakukan update, audit, dan
   outbox dalam satu transaksi singkat.

Database time (`clock_timestamp()`) menjadi sumber waktu lease. Partial unique
index pada active status menjadi defense-in-depth agar satu printer tidak
memiliki lebih dari satu job `claimed`/`sending`.

Status `sending` yang lease/job-nya kedaluwarsa menjadi `delivery_unknown` dan
tidak pernah otomatis kembali ke queue. Result callback identik tetap idempotent
setelah restart karena outcome dan `bytes_sent` dipersistensikan; callback yang
berbeda ditolak sebagai conflict.

## 6. Pemetaan kontrak

- PostgreSQL `job_id UUID` dipublikasikan sebagai string UUID yang valid menurut
  kontrak `PrintJob.job_id`.
- `executor_id` dipetakan ke `claim.agent_id`.
- `fencing_token` dipetakan ke `claim.fencing_token`.
- `source_metadata` harus berisi bentuk `SourceMetadata` strict sebelum dapat
  dibaca oleh adapter.
- `confirmed_dpi NUMERIC(7,3)` dipetakan ke `PrintJob.dpi`.
- Artifact tetap disimpan di filesystem; PostgreSQL hanya menyimpan opaque
  `payload_ref`, filename, media type, byte length, dan checksum.

Batch creation tidak dipaksakan melalui method `create_idempotent()` lama.
Ingestion batch/job memerlukan service transaction sendiri karena harus membuat
media/template/batch/item/job/artifact secara konsisten.

## 7. Bukti pengujian

Pada PostgreSQL 15 disposable lokal:

- forward DDL: PASS;
- validation harness: PASS, 34 negative test cases dengan SQLSTATE dan exact
  `CONSTRAINT_NAME`;
- rollback tanpa `CASCADE`: PASS, 0 table tersisa;
- migration apply + repeated apply + checksum verify: PASS;
- atomic lifecycle repository: PASS;
- stale fencing token: ditolak;
- dua concurrent claim pada printer yang sama: satu pemenang;
- callback result identik: idempotent dan satu outbox event;
- HTTP API sampai `MemoryPrinterTransport` dan kembali ke PostgreSQL: PASS.

Pengujian tersebut bukan bukti production-ready. Load test, failover database,
role/privilege isolation, backup/restore, upgrade migration dari versi produksi,
observability, serta transport printer nyata belum dijalankan.
