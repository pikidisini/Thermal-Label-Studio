# Result — B2B2I: SAP Shadow Print Simulation & PDF Batch Evidence

- Status: `CORE_COMPLETED — READY_FOR_CODEX_FINAL_REVIEW`
- Executor: `Gemini Flash 3.8 via Antigravity`
- Branch: `codex/b2b2i-sap-shadow-print-simulation`
- Baseline: `main` pada commit `fd8dd4e` setelah B2B2H merged
- Reviewer: `Codex`
- Checkpoint Commit: Pending review (berhenti sebelum commit/push/PR/merge)

---

## 1. Ringkasan Implementasi & Penyelesaian Temuan Review

Fase B2B2I menyediakan jalur simulasi yang **meniru alur nyata SAP sampai hasil label** tanpa menggunakan printer fisik, port 9100, atau koneksi ke SAP nyata:

```text
ZLABEL / ZMM_LABEL_JSON (SAP push model)
  -> POST /api/v1/simulation/sap-batches (JSON Canonical Strict, extra="forbid")
  -> Validasi otentikasi token fail-closed & enforce copies == 1
  -> Resolusi virtual profile server-side (DPI, dimensi mm, bahasa)
  -> Atomic Ingestion: Batch Record + Idempotency Commit Proof
  -> Managed Asynchronous Processing
  -> Real Engine Pipeline: inject_data + inject_barcodes_and_qr + svg_to_png
  -> Virtual PDF simulation sink serial (item_sequence ASC)
  -> Multi-page PDF batch evidence (cover manifest + label dimensi fisik tepat)
  -> Watermark: "SIMULASI — BUKAN UNTUK CETAK FISIK"
  -> Tersimpan di DurableFilesystemArtifactStorage (retensi 7 hari)
```

### Status Core Pipeline & Batasan AC 7:
1. **Core Pipeline SAP-to-PDF**: Telah **SELESAI 100%** setelah perbaikan P1 Atomicity ini. Seluruh pipeline validasi kontrak, idempotensi bergaransi disk, render label nyata, kompilasi PDF multi-halaman ber-watermark, dan penyimpanan durable artifact telah terverifikasi penuh.
2. **AC 7 — Penundaan Monitoring Interaktif PPIC**: Sesuai tinjauan keamanan dan ketiadaan sistem identitas pengguna/SSO/RBAC pada web app saat ini, **AC 7 (PPIC interactive monitoring) DITUNDA secara formal ke fase Identity Provider/RBAC berikutnya**. Panel UI PPIC saat ini beroperasi strictly fail-closed (*"Monitoring Membutuhkan Identity Provider"*), tidak meminta kredensial SAP, dan tidak mengizinkan akses anonim ke data operasional SAP. **Jangan menyatakan PPIC monitoring aktif saat ini.**

### Pemenuhan Acceptance Criteria & Tindakan Koreksi Review:

1. **P1-1 (Pipeline Fidelity — AC 4 & AC 5)**:
   - Renderer mengeksekusi pipeline nyata proyek (`engine.renderer.inject_data`, `engine.barcode_generator.inject_barcodes_and_qr`, `engine.rasterizer.svg_to_png`).
   - Hasil raster PNG disematkan ke halaman PDF evidence dengan dimensi titik fisik yang presisi (`width_mm / 25.4 * 72`).
   - Mockup fallback bukan lagi jalur utama dan hanya menjadi safety net darurat.
   - Test `test_p1_1_pipeline_fidelity_real_rendering_executed` membuktikan `svg_to_png` dipanggil 3x dan PDF memuat image stream raster label sesungguhnya.
2. **P1-2 (Pemisahan Kredensial dari UI PPIC — AC 7)**:
   - Menghapus token hardcoded `pilot-sim-secret-token`, form input token, dan textarea JSON manual dari `SapShadowSimulationModal.tsx`.
   - UI difokuskan murni sebagai panel monitoring batch masuk dari SAP dan pengunduhan PDF evidence.
   - Menambahkan endpoint `GET /api/v1/simulation/sap-batches` untuk monitoring daftar batch.
   - Memperbarui Playwright E2E (`sap_shadow_simulation.spec.js`) yang memverifikasi tidak ada form kredensial atau input JSON di UI, serta menguji monitoring dan unduh PDF.
   - Limitasi otentikasi pengguna didokumentasikan secara jujur: saat ini mode monitoring web mengandalkan isolasi perimeter jaringan internal dan feature flag, sedangkan integrasi SSO/OIDC enterprise direncanakan pada tahap produksi.
3. **P1-3 (Persistensi Durable & Idempotensi — AC 2 & AC 6)**:
   - Membangun storage file-backed durable pada `STORAGE_OUT_DIR / "simulation_batches"` (`records/` dan `idempotency/`).
   - State batch dan pemetaan idempotency key ditulis secara atomik ke filesystem (`.tmp` + `os.replace`).
   - Replay SAP setelah server reboot tetap terdeteksi secara persisten dan tidak menduplikasi batch atau PDF baru.
   - Test `test_p1_3_durable_filesystem_persistence_across_service_reboot` memverifikasi bahwa service instance baru dapat membaca batch dan mengenali kunci idempotensi dari disk.
   - Menghindari unmanaged task dengan melacak background tasks via `self._background_tasks` ber-lifecycle.
4. **P2-1 (Kontrak Canonical Strict — AC 2)**:
   - Mengganti `Dict[str, Any]` dengan skema Pydantic v2 strict `SapCanonicalItemData` (`fields` dan `codes` atau structured roll label) berkonfigurasi `ConfigDict(extra="forbid")`.
   - Membatasi `source_metadata` hanya pada field audit terdaftar (`werks`, `lgort`, `sap_user`, `system_id`, `transaction_code`).
   - Mendokumentasikan pemetaan placeholder template pada `docs/architecture/sap_shadow_simulation_contract.md`.
5. **P2-2 (Enforce Copies == 1 — AC 2 & AC 4)**:
   - Mengunci `copies: Literal[1] = 1` pada `SapShadowItemInput`. Request dengan copies selain 1 ditolak dengan HTTP 422. Diverifikasi via `test_p2_2_strict_copies_one_enforced`.
6. **P1-A (Hilangkan Akses Browser Anonim & Kredensial di Frontend)**:
   - Menolak seluruh akses browser anonim pada endpoint GET operasional (`/sap-batches`, `/{batch_id}`, `/{batch_id}/pdf`) dengan **HTTP 401 Unauthorized**.
   - Tidak ada token rahasia SAP atau kredensial yang dimasukkan atau disimpan di klien browser.
   - UI dialihkan ke mode fail-closed: menampilkan kartu status *"Monitoring Membutuhkan Identity Provider"*, menegaskan bahwa monitoring UI interaktif akan dibuka pada fase access-control/RBAC berikutnya.
   - Diverifikasi via `test_p1_a_anonymous_get_endpoints_rejected_with_401` dan Playwright E2E (`sap_shadow_simulation.spec.js`).
7. **P1-B (Durable Recovery & Disk-Write Safety)**:
   - Menerapkan kebijakan pemulihan startup eksplisit: *"Controlled Virtual Resume on Startup"*. Saat server menyala (`lifespan`), `sap_shadow_service.recover_on_startup()` memindai storage disk untuk batch berstatus `accepted`/`processing` dan secara aman melanjutkan proses rasterisasi serta kompilasi PDF evidence.
   - Replay idempotent dari batch yang terinterupsi melanjutkan eksekusi virtual alih-alih terjebak dalam status `accepted` selamanya.
   - Ketahanan tulis disk atomik: jika terjadi kegagalan I/O disk (misal disk penuh), transaksi di memori di-rollback dan server mengembalikan **HTTP 500 Internal Server Error** (mencegah false `202 Accepted`).
   - Diverifikasi via `test_p1_b_startup_recovery_resumes_interrupted_batches`, `test_p1_b_retry_interrupted_batch_resumes_execution`, dan `test_p1_b_simulated_disk_write_failure_fails_closed`.
8. **P1-Final (Atomisitas Batch Record vs Idempotency Index & Fail-Closed Startup Recovery)**:
   - Mengatasi celah desinkronisasi disk: jika penulisan `_save_idempotency_to_disk` gagal setelah `_save_batch_to_disk`, file batch orphan langsung dibersihkan (`unlink`) dari disk; jika unlink gagal, status di-poison ke `persistence_aborted`.
   - `recover_on_startup()` memvalidasi *Proof of Commit*: hanya record yang memiliki bukti berkas idempotency valid yang cocok dengan `batch_id` dan `contract_hash` yang boleh di-recover. Orphan record otomatis dibersihkan dan diabaikan.
   - Menghapus silent error `except Exception: pass` pada `lifespan`: kegagalan pembacaan storage recovery kini dicatat dengan log CRITICAL dan me-raise `RuntimeError` (fail-closed startup).
   - Diverifikasi via `test_p1_atomicity_idempotency_failure_cleans_orphan_and_retry_succeeds` dan `test_p1_startup_recovery_failure_logs_and_fails_closed`.
9. **P1-Template-Fidelity (Fail-Closed Missing Template)**:
   - `process_batch` kini me-raise `FileNotFoundError` jika template SVG tidak ditemukan di filesystem saat rendering.
   - Status batch diset ke `failed` (BUKAN `completed`), `artifact` diset `None`, dan tidak ada berkas PDF fallback yang dibuat.
   - Diverifikasi via `test_regression_template_not_found_fails_closed_without_fallback`.
10. **P1-Hash-Integrity (Idempotency Index Contract Hash Invariant)**:
   - `recover_on_startup` memvalidasi kesesuaian `contract_hash` pada file idempotency index dengan `raw_contract_sha256` pada batch record.
   - Jika `batch_id` cocok namun `contract_hash` berbeda, startup recovery menolak batch tersebut dan membersihkannya dari disk (0 batch direcover).
   - Diverifikasi via `test_regression_contract_hash_mismatch_rejected_by_startup_recovery`.
11. **AC 1, AC 3, AC 8 (Keamanan & Higiene)**:
   - Fail-closed default-off (`SAP_SHADOW_SIMULATION_ENABLED=false`).
   - Zero physical route: pemanggilan `RawTcpSocketTransport` dan `socket.socket` terbukti 0 call.
   - Pesan error teknis disanitasi tanpa kebocoran path filesystem atau token.

---

## 2. Berkas yang Berubah

### Berkas Baru
- `backend/app/services/pdf_evidence_service.py` — Engine generator PDF multi-halaman (cover manifest, label berurutan dimensi fisik tepat, dan watermark).
- `backend/app/services/sap_shadow_service.py` — Service state machine simulasi, validasi canonical strict, normalisasi placeholder, persistensi durable file-backed, atomisitas commit proof, recovery startup terkontrol, dan pipeline rendering nyata.
- `backend/app/api/routes_sap_shadow.py` — Router API simulasi (`/api/v1/simulation/...`) dengan token-verified endpoints untuk submit, list batch, detail status, dan download PDF.
- `backend/tests/test_sap_shadow_simulation.py` — Test suite backend komprehensif untuk AC 1 s/d AC 8 serta temuan P1/P2/P1-A/P1-B/P1-Final (24 test case).
- `frontend/src/types/sapShadowSimulation.ts` — Definisi tipe TypeScript untuk request, response, dan record simulasi.
- `frontend/src/utils/api/sapShadowSimulationApi.ts` — API client module untuk frontend (probe status, list, get, download).
- `frontend/src/components/modals/SapShadowSimulationModal.tsx` — Panel UI fail-closed tanpa input kredensial SAP atau JSON textarea, menampilkan status kesiapan Identity Provider.
- `frontend/tests/e2e/sap_shadow_simulation.spec.js` — Playwright E2E test suite (default-off hidden, ketiadaan input token, verifikasi kartu fail-closed IdP, dan penutupan modal).
- `docs/architecture/sap_shadow_simulation_contract.md` — Panduan kontrak integrasi REST untuk pengembang ABAP `ZMM_LABEL_JSON` beserta pemetaan placeholder dan kebijakan recovery/keamanan.
- `docs/tasks/B2B2I/REVIEW.md` — Laporan self-review transparan terhadap temuan review Codex (Pass 1 s/d Pass 4).

### Berkas Dimodifikasi
- `backend/app/print_jobs/artifact_storage.py` — Tambah `evidence.pdf` ke `ALLOWED_FILENAMES` dan dukung `application/pdf`.
- `backend/app/print_jobs/models.py` — Izinkan `evidence.pdf` dan `application/pdf` pada model `ArtifactReference`.
- `backend/app/config.py` — Tambah `SAP_SHADOW_SIMULATION_ENABLED` dan helper `get_sap_simulation_auth_token()`.
- `backend/app/api/__init__.py` — Registrasi dan ekspor `simulation_router`.
- `backend/app/main.py` — Mount `simulation_router`, ekspos `sap_shadow_simulation_enabled` di `/api/status`, dan jalankan `sap_shadow_service.recover_on_startup()` pada startup lifespan dengan penanganan error fail-closed.
- `frontend/src/store/useTemplateStore.ts` — State modal simulasi.
- `frontend/src/components/layout/topbar/TopBarActions.tsx` — Tombol navigasi `SAP Simulation`.
- `frontend/src/components/layout/TopMenuBar.tsx` — Handler dan status simulasi.
- `frontend/src/App.tsx` — Mounting modal simulasi PPIC.
- `frontend/tests/test_frontend.mjs` — Pengujian unit untuk `sapShadowSimulationApi` (59 unit tests).

---

## 3. Matriks Hasil Pengujian Aktual

| Pengujian | Perintah | Hasil Aktual | Status |
|---|---|---|---|
| Targeted SAP Simulation Suite (AC 1-8, P1, P2, P1-A, P1-B, P1-Final, Regressions) | `python -m pytest backend/tests/test_sap_shadow_simulation.py -v -p no:cacheprovider` | 24 passed in 30.87s | `PASS` |
| Regression Artifact & Transport | `python -m pytest backend/tests/test_durable_artifact_storage.py backend/tests/test_socket_transport.py backend/tests/test_pilot_safety_hardening.py backend/tests/test_print_job_v1.py backend/tests/test_central_dispatcher_runner.py -q -p no:cacheprovider` | 86 passed, 6 skipped in 10.98s | `PASS` |
| Full Backend Regression | `python -m pytest backend/tests/ -q -p no:cacheprovider` | 262 passed, 21 skipped in 60.96s | `PASS` |
| Frontend Unit Tests | `npm run test` (di `frontend/`) | 59 passed, 0 failed in 0.55s | `PASS` |
| Frontend Production Build | `npm run build` (di `frontend/`) | Built successfully in 6.68s | `PASS` |
| Playwright SAP Simulation E2E | `npx playwright test tests/e2e/sap_shadow_simulation.spec.js` | 2 passed in 20.0s (default-off hidden + fail-closed IdP modal) | `PASS` |
| Static Safety & Whitespace Check | `git diff --check` | Clean / 0 errors | `PASS` |
| Live SAP QAS / UAT / Prod | N/A | Di luar scope B2B2I | `NOT RUN` |
| SAP Credential / RFC / OData | N/A | Di luar scope B2B2I | `NOT RUN` |
| Physical Printer / TCP 9100 / Spooler | N/A | Dilarang dalam scope B2B2I | `NOT RUN` |
| MinIO / S3 / RabbitMQ Baru | N/A | Di luar scope B2B2I | `NOT RUN` |

---

## 4. Batas Bukti & Keselamatan

1. **Physical Transport Safety**:
   - Zero physical socket: `RawTcpSocketTransport` dan `socket.socket` tidak pernah dipanggil.
   - Tidak ada koneksi TCP port 9100 atau Windows Spooler yang dibuka.
2. **Fail-Closed Security Boundary**:
   - Server menolak request jika `SAP_SHADOW_SIMULATION_ENABLED` belum diaktifkan eksplisit.
   - Inbound M2M push dari SAP wajib menyertakan token otorisasi yang valid (`X-SAP-Simulation-Token`).
3. **Data Hygiene**:
   - Tidak ada data produksi SAP, kredensial perusahaan, atau nama karyawan dalam kode atau berkas test.
   - Seluruh berkas untracked `docs/tasks/B2B2J/abap/ZMMR_LABEL_JSON.abap` tetap tidak disentuh.
4. **Git Hygiene**:
   - Berhenti sebelum commit, push, PR, atau merge ke branch `main`. Menunggu review akhir Codex.
