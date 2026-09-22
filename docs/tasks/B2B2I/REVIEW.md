# Self-Review & Verification Report — B2B2I (Review Corrections)

- Task: `B2B2I — SAP Shadow Print Simulation & PDF Batch Evidence`
- Review Iteration: `Correction Pass 4 (P1 Atomicity & Fail-Closed Startup Recovery)`
- Branch: `codex/b2b2i-sap-shadow-print-simulation`
- Executor: `Gemini Flash 3.8 via Antigravity`
- Status: `CORE_COMPLETED — READY_FOR_CODEX_FINAL_REVIEW`

---

## 1. Status Penyelesaian Temuan Review Codex

| Item | Klasifikasi | Temuan Awal Codex | Tindakan Koreksi Aktual | Status Verifikasi |
|---|---|---|---|---|
| **P1-1** | High Risk / Pipeline Fidelity | Mockup fallback digunakan alih-alih renderer proyek nyata; PDF tidak membuktikan representasi label sesungguhnya. | Mengintegrasikan pipeline nyata (`engine.renderer.inject_data`, `engine.barcode_generator.inject_barcodes_and_qr`, `engine.rasterizer.svg_to_png`). Hasil render PNG disematkan pada halaman PDF dengan dimensi titik fisik yang presisi dan di-overlay watermark simulasi. Menambahkan test `test_p1_1_pipeline_fidelity_real_rendering_executed` yang memverifikasi `svg_to_png` dipanggil 3x dan PDF memuat image stream raster label. | `RESOLVED & VERIFIED` |
| **P1-2** | Security Boundary / Credential Decoupling | Kredensial hardcoded `pilot-sim-secret-token` dan form input token/JSON manual terekspos di UI PPIC. | Menghapus token hardcoded, input token, dan textarea JSON manual dari `SapShadowSimulationModal.tsx`. UI difokuskan murni sebagai panel monitoring batch masuk dari SAP dan unduh PDF evidence. Menambahkan endpoint `GET /api/v1/simulation/sap-batches`. Memperbarui Playwright E2E untuk memverifikasi ketiadaan form kredensial di UI. Mendokumentasikan limitasi autentikasi pengguna secara jujur. | `RESOLVED & VERIFIED` |
| **P1-3** | Reliability / Durable Persistence | Batch dan indeks idempotensi hanya disimpan di memory dictionary, hilang saat restart sehingga retry menduplikasi batch/PDF. | Membangun durable file-backed persistence di `STORAGE_OUT_DIR / "simulation_batches"` (`records/` dan `idempotency/`). State batch (`accepted`, `processing`, `completed`, `failed`) dan kunci idempotensi ditulis secara atomik ke disk. Menambahkan test `test_p1_3_durable_filesystem_persistence_across_service_reboot` yang membuktikan instance baru dapat memuat batch dan mengenali replay idempotensi tanpa memory state. Mengelola background tasks via `self._background_tasks`. | `RESOLVED & VERIFIED` |
| **P2-1** | Data Contract / Validation | `Dict[str, Any]` tak terbatas membuka celah field ilegal; `source_metadata` tidak dibatasi. | Mengganti `Dict[str, Any]` dengan skema Pydantic v2 strict `SapCanonicalItemData` (`SapCanonicalFields` + `SapCanonicalCodes` atau structured roll label) dengan `ConfigDict(extra="forbid")`. Membatasi `source_metadata` hanya pada field audit terdaftar (`werks`, `lgort`, `sap_user`, `system_id`, `transaction_code`). Mendokumentasikan pemetaan placeholder template pada kontrak integrasi. | `RESOLVED & VERIFIED` |
| **P2-2** | Contract Invariant | `copies` tidak dibatasi tegas ke 1 pada simulasi pilot. | Mengunci `copies: Literal[1] = 1` pada `SapShadowItemInput`. Request dengan `copies != 1` (misal 2 atau 0) langsung ditolak dengan HTTP 422 Unprocessable Entity. Diverifikasi via `test_p2_2_strict_copies_one_enforced`. | `RESOLVED & VERIFIED` |
| **P1-A** | Security Boundary / Anonymous Access Elimination | Endpoint GET operational `/sap-batches`, `/{batch_id}`, `/{batch_id}/pdf` dapat diakses anonim di browser, membocorkan data operasional SAP / PDF. | Mengharuskan `verify_simulation_token` pada seluruh endpoint GET operational. Akses anonim ditolak dengan HTTP 401. UI dialihkan ke status fail-closed *"Monitoring Membutuhkan Identity Provider"* (zero credentials di frontend, dokumen arsitektur menjelaskan roadmap RBAC). Diuji via `test_p1_a_anonymous_get_endpoints_rejected_with_401` dan Playwright E2E. | `RESOLVED & VERIFIED` |
| **P1-B** | Durable Recovery & Failure Safety | Ketergantungan unmanaged `asyncio.create_task`; batch accepted/processing stuck jika restart; retry idempotensi mengembalikan stuck batch selamanya; disk write failure tidak rollback memory. | Menerapkan kebijakan eksplisit *"Controlled Virtual Resume on Startup"* via `recover_on_startup()` di FastAPI `lifespan`. Ingest replay idempotent me-resume batch terinterupsi. Penulisan disk dilengkapi rollback state memori dan HTTP 500 jika gagal menulis secara persisten (mencegah false 202). Diuji via `test_p1_b_startup_recovery_resumes_interrupted_batches`, `test_p1_b_retry_interrupted_batch_resumes_execution`, dan `test_p1_b_simulated_disk_write_failure_fails_closed`. | `RESOLVED & VERIFIED` |
| **P1-Final** | Atomicity Batch Record vs Idempotency Index & Startup Error Handling | Kegagalan penulisan `_save_idempotency_to_disk` meninggalkan file batch record di disk sehingga dapat di-recover startup meskipun SAP menerima 500; `lifespan` startup menyembunyikan error recovery dengan `pass`. | 1) Membersihkan file batch record orphan dari disk jika penulisan idempotency gagal; jika cleanup gagal, me-poison status ke `persistence_aborted`.<br>2) Menambahkan validasi *Proof of Commit* pada `recover_on_startup()`: batch orphan tanpa commit idempotency valid tidak akan pernah di-recover.<br>3) Menghapus `pass` pada `lifespan`: kegagalan pembacaan storage recovery kini di-log dengan level CRITICAL dan me-raise `RuntimeError` (fail-closed).<br>Diuji via `test_p1_atomicity_idempotency_failure_cleans_orphan_and_retry_succeeds` dan `test_p1_startup_recovery_failure_logs_and_fails_closed`. | `RESOLVED & VERIFIED` |
| **P1-Template-Fidelity** | Fail-closed Missing Template | Template tidak ditemukan pada sistem berkas berisiko fallback diam-diam ke mockup vector atau menandai batch selesai tanpa render nyata. | `process_batch` kini me-raise `FileNotFoundError` bila template tidak ditemukan di disk; status batch diset ke `failed` (BUKAN `completed`), `artifact` diset `None` (tidak ada PDF fallback dibuat). Diuji via `test_regression_template_not_found_fails_closed_without_fallback`. | `RESOLVED & VERIFIED` |
| **P1-Hash-Integrity** | Idempotency Index Contract Hash Invariant | Bila `batch_id` cocok namun `contract_hash` pada file indeks idempotensi berbeda dengan `raw_contract_sha256` pada record batch, startup recovery berisiko memproses record yang korup/desinkron. | `recover_on_startup` memvalidasi kesamaan `contract_hash`; bila terjadi mismatch, batch langsung ditolak, dibersihkan dari disk, dan tidak di-recover. Diuji via `test_regression_contract_hash_mismatch_rejected_by_startup_recovery`. | `RESOLVED & VERIFIED` |

---

## 2. Status Core Pipeline & Batasan AC 7

1. **Core Pipeline SAP-to-PDF**: Telah **SELESAI 100%** (AC 1 s/d AC 6, AC 8, AC 9). Jalur canonical SAP JSON -> validasi strict -> idempotensi durable -> rendering pipeline nyata (text + vector barcode/QR + raster) -> multi-page PDF evidence (manifest cover + label berurutan + watermark simulasi) -> durable storage terverifikasi sempurna.
2. **AC 7 — Penundaan Monitoring Interaktif PPIC**: Sesuai tinjauan keamanan dan ketiadaan sistem identitas pengguna/SSO/RBAC pada web app saat ini, **AC 7 (PPIC interactive monitoring) DITUNDA secara formal ke fase Identity Provider/RBAC berikutnya**. Panel UI PPIC saat ini beroperasi strictly fail-closed (*"Monitoring Membutuhkan Identity Provider"*), tidak meminta kredensial SAP, dan tidak mengizinkan akses anonim ke data operasional SAP. **Jangan menyatakan PPIC monitoring aktif saat ini.**

---

## 3. Batasan Lingkup yang Dijaga Ketat

- `docs/tasks/B2B2J/abap/ZMMR_LABEL_JSON.abap` tetap tidak disentuh, tidak diubah, dan tidak di-stage.
- Tidak ada koneksi ke printer fisik, TCP 9100, atau Windows Spooler.
- Tidak ada koneksi ke SAP nyata, RFC, OData, atau kredensial produksi.
- Tidak ada MinIO, S3, atau RabbitMQ baru.
- Berhenti sebelum git commit, push, PR, atau merge ke `main`.
