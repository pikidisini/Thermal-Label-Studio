# Referensi source

Snapshot: **17 Oktober 2026 (Asia/Jakarta)**, berdasarkan working tree lokal.
Inventaris dibuat dengan pemeriksaan statis Python AST dan nama dalam source,
tanpa mengimpor atau menjalankan aplikasi. Isinya menjelaskan deklarasi source,
bukan keterjangkauan route pada deployment atau konfigurasi runtime aktif.
[Kontrak API](API_CONTRACT.md) menentukan skema, izin, serta efek operasi.
Pembaruan 21 Oktober 2026 menambahkan login, akun/peran, dan katalog RFC Operator;
lihat [kontrak akses](AUTH_CONTRACT.md) untuk batas aktivasi.

## Komposisi dan titik masuk halaman

Komposisi backend: [main.py](../backend/app/main.py), komposisi Management:
[router.py](../backend/app/management/router.py), halaman frontend:
[routes.tsx](../frontend/src/app/routes.tsx). Prefix API default adalah `/api/v1`.
Halaman frontend adalah `/login`, `/`, `/studio`, `/print`, `/management`, dan
`/fixture-simulation`. Shell/aset backend diatur tersendiri dalam
[runtime.py](../backend/app/runtime.py). Route dokumentasi yang dibuat otomatis
oleh FastAPI berada di luar inventaris deklarasi ini.

## Deklarasi route API

Path berikut menggabungkan prefix utama default dan prefix router yang dipasang.
Setiap tautan menunjuk source handler. Deklarasi belum membuktikan fitur sudah
aktif; baca pemeriksaan sesi/peran/origin, konfigurasi, dan kontraknya sebelum memanggilnya.
`PATCH` dan `DELETE /api/v1/layouts/{label_code}` dipertahankan sebagai handler
pensiun yang mengembalikan HTTP 410; gunakan perintah template Management yang diaudit.

| Metode | Path | Source handler |
| --- | --- | --- |
| GET | `/api/v1/auth/session` | [get_session](../backend/app/auth/http.py) |
| POST | `/api/v1/auth/login` | [login](../backend/app/auth/http.py) |
| POST | `/api/v1/auth/logout` | [logout](../backend/app/auth/http.py) |
| POST | `/api/v1/auth/change-password` | [change_password](../backend/app/auth/http.py) |
| POST | `/api/v1/auth/activity` | [activity](../backend/app/auth/http.py) |
| GET | `/api/v1/management/users` | [list_users](../backend/app/auth/http.py) |
| POST | `/api/v1/management/users` | [create_user](../backend/app/auth/http.py) |
| PATCH | `/api/v1/management/users/{identity}` | [update_user](../backend/app/auth/http.py) |
| POST | `/api/v1/management/users/{identity}/reset-password` | [reset_password](../backend/app/auth/http.py) |
| GET | `/api/v1/label-print/operations` | [operator_operations](../backend/app/label_print/http.py) |
| POST | `/api/v1/design/validate` | [validate_design](../backend/app/simulation/design_http.py) |
| GET | `/api/v1/graphics` | [list_graphics](../backend/app/graphics/http.py) |
| POST | `/api/v1/graphics` | [upload_graphic](../backend/app/graphics/http.py) |
| GET | `/api/v1/graphics/{identifier}` | [get_graphic](../backend/app/graphics/http.py) |
| GET | `/api/v1/graphics/{identifier}/content` | [graphic_content](../backend/app/graphics/http.py) |
| POST | `/api/v1/label-intake` | [intake](../backend/app/label_intake/http.py) |
| POST | `/api/v1/label-print/preview` | [preview_batches](../backend/app/label_print/http.py) |
| POST | `/api/v1/label-print/print` | [print_registered_labels](../backend/app/label_print/http.py) |
| POST | `/api/v1/label-print/print-package` | [print_package](../backend/app/label_print/http.py) |
| POST | `/api/v1/label-print/printer-status` | [registered_printer_status](../backend/app/label_print/http.py) |
| GET | `/api/v1/label-print/printers` | [configured_printers](../backend/app/label_print/http.py) |
| POST | `/api/v1/labels/process` | [validate_label_process](../backend/app/main.py) |
| GET | `/api/v1/layouts` | [list_layouts](../backend/app/layouts/http.py) |
| POST | `/api/v1/layouts` | [save_layout](../backend/app/layouts/http.py) |
| DELETE | `/api/v1/layouts/{label_code}` | [delete_layout](../backend/app/layouts/http.py) |
| GET | `/api/v1/layouts/{label_code}` | [get_layout](../backend/app/layouts/http.py) |
| PATCH | `/api/v1/layouts/{label_code}` | [rename_layout](../backend/app/layouts/http.py) |
| GET | `/api/v1/layouts/{label_code}/versions` | [list_versions](../backend/app/layouts/http.py) |
| GET | `/api/v1/management/activity` | [activity](../backend/app/management/activity/http.py) |
| GET | `/api/v1/management/audit` | [audit](../backend/app/management/audit/http.py) |
| PUT | `/api/v1/management/printers` | [save_target](../backend/app/management/printers/http.py) |
| DELETE | `/api/v1/management/printers/{target_id}` | [remove_target](../backend/app/management/printers/http.py) |
| PUT | `/api/v1/management/sap-connections` | [save_connection](../backend/app/management/integrations/sap_http.py) |
| DELETE | `/api/v1/management/sap-connections/{identity}` | [remove_connection](../backend/app/management/integrations/sap_http.py) |
| GET | `/api/v1/management/sap-operations` | [operation_catalog](../backend/app/management/integrations/sap_http.py) |
| PUT | `/api/v1/management/sap-operations` | [save_operation](../backend/app/management/integrations/sap_http.py) |
| DELETE | `/api/v1/management/sap-operations/{identity}` | [remove_operation](../backend/app/management/integrations/sap_http.py) |
| POST | `/api/v1/management/sap-operations/{identity}/execute` | [execute](../backend/app/management/integrations/sap_http.py) |
| POST | `/api/v1/management/sap-operations/{identity}/sample` | [sample](../backend/app/management/integrations/sap_http.py) |
| GET | `/api/v1/management/snapshot` | [snapshot](../backend/app/management/overview/http.py) |
| PUT | `/api/v1/management/sources` | [save_source](../backend/app/management/integrations/http.py) |
| DELETE | `/api/v1/management/sources/{identity}` | [remove_source](../backend/app/management/integrations/http.py) |
| POST | `/api/v1/management/sources/{identity}/key` | [manage_key](../backend/app/management/integrations/http.py) |
| POST | `/api/v1/management/templates/{label_code}` | [manage_template](../backend/app/management/templates/http.py) |
| POST | `/api/v1/printing/editor` | [print_editor](../backend/app/printing/http.py) |
| GET | `/api/v1/printing/target` | [get_print_target](../backend/app/printing/http.py) |
| POST | `/api/v1/simulation/editor-preview` | [simulate_editor_preview](../backend/app/simulation/editor_http.py) |
| POST | `/api/v1/simulation/fixture` | [simulate_fixture](../backend/app/simulation/http.py) |
| GET | `/api/v1/studio-sample-datasets` | [list_datasets](../backend/app/studio_datasets/http.py) |
| POST | `/api/v1/studio-sample-datasets` | [create_dataset](../backend/app/studio_datasets/http.py) |
| GET | `/api/v1/studio-sample-datasets/{identifier}` | [get_dataset](../backend/app/studio_datasets/http.py) |
| PUT | `/api/v1/studio-sample-datasets/{identifier}` | [update_dataset](../backend/app/studio_datasets/http.py) |
| GET | `/health` | [health](../backend/app/main.py) |
| GET | `/ready` | [ready](../backend/app/main.py) |

## Inventaris modul

Direktori menunjukkan kepemilikan implementasi, bukan layanan yang di-deploy
secara mandiri. Lihat [panduan utama](PROJECT_HANDBOOK.md#3-arsitektur-dan-tanggung-jawab-modul)
untuk tanggung jawab setiap modul.

| Batas modul | Modul |
| --- | --- |
| `backend/app` | [activity](../backend/app/activity/) |
| `backend/app` | [engine](../backend/app/engine/) |
| `backend/app` | [graphics](../backend/app/graphics/) |
| `backend/app` | [jobs](../backend/app/jobs/) |
| `backend/app` | [label_data](../backend/app/label_data/) |
| `backend/app` | [label_intake](../backend/app/label_intake/) |
| `backend/app` | [label_print](../backend/app/label_print/) |
| `backend/app` | [labels](../backend/app/labels/) |
| `backend/app` | [layouts](../backend/app/layouts/) |
| `backend/app` | [management](../backend/app/management/) |
| `backend/app` | [printing](../backend/app/printing/) |
| `backend/app` | [protocols](../backend/app/protocols/) |
| `backend/app` | [sap](../backend/app/sap/) |
| `backend/app` | [sap_rfc](../backend/app/sap_rfc/) |
| `backend/app` | [simulation](../backend/app/simulation/) |
| `backend/app` | [studio_datasets](../backend/app/studio_datasets/) |
| `backend/app` | [template_binding](../backend/app/template_binding/) |
| `backend/app` | [themes](../backend/app/themes/) |
| `frontend/src/features` | [barcode](../frontend/src/features/barcode/) |
| `frontend/src/features` | [canvas](../frontend/src/features/canvas/) |
| `frontend/src/features` | [data-tokens](../frontend/src/features/data-tokens/) |
| `frontend/src/features` | [diagnostics](../frontend/src/features/diagnostics/) |
| `frontend/src/features` | [graphics](../frontend/src/features/graphics/) |
| `frontend/src/features` | [home](../frontend/src/features/home/) |
| `frontend/src/features` | [images](../frontend/src/features/images/) |
| `frontend/src/features` | [label-print](../frontend/src/features/label-print/) |
| `frontend/src/features` | [line](../frontend/src/features/line/) |
| `frontend/src/features` | [management](../frontend/src/features/management/) |
| `frontend/src/features` | [preferences](../frontend/src/features/preferences/) |
| `frontend/src/features` | [printing](../frontend/src/features/printing/) |
| `frontend/src/features` | [qr](../frontend/src/features/qr/) |
| `frontend/src/features` | [saved-themes](../frontend/src/features/saved-themes/) |
| `frontend/src/features` | [simulation](../frontend/src/features/simulation/) |
| `frontend/src/features` | [snapping](../frontend/src/features/snapping/) |
| `frontend/src/features` | [studio](../frontend/src/features/studio/) |
| `frontend/src/features` | [templates](../frontend/src/features/templates/) |
| `frontend/src/features` | [text](../frontend/src/features/text/) |

## Kelompok konfigurasi

| Kelompok | Kegunaan / batas aktivasi |
| --- | --- |
| `TLS_DATABASE_URL`, `TLS_MINIO_*` | Penyimpanan layout; pengaturan wajib disediakan bersama, dan startup terkonfigurasi menginisialisasi skema/bucket |
| `TLS_RENDERER_PATH`, `TLS_FIXTURE_FONT_*`, `TLS_FRONTEND_DIST` | Path absolut aset runtime tepercaya / profil font yang didukung |
| `TLS_PRINTER_HOST`, `TLS_PRINTER_PORT` | Tujuan cadangan opsional Studio Print; target LAN terdaftar berasal dari Management |
| `TLS_MANAGEMENT_*` | State terkelola yang diaktifkan eksplisit dan key enkripsi eksternal; provisioning skema terpisah |
| `TLS_ACTIVITY_ENABLED` | Riwayat best-effort yang diaktifkan eksplisit; memerlukan skema/grant tersendiri |
| `TLS_SAP_RFC_*` | Python worker native, daftar target/fungsi yang diizinkan, dan aktivasi eksplisit |
| `TLS_INTAKE_*` | Kebijakan sumber / ledger permanen eksplisit, DSN khusus, serta referensi key HMAC yang dipertahankan |
| `TLS_COVERAGE_*`, pengaturan uji/kualitas lain | Kontrol perangkat pemeriksaan; bukan izin operasi produksi |

Lihat [Pengembangan](DEVELOPMENT.md), [.env.example](../.env.example), dan modul
pemakai untuk default serta validasinya. `.env` pada root yang diabaikan Git
merupakan input Compose; Python tidak memuatnya secara otomatis. Nama khusus
Compose, termasuk `RESVG_SHA256`, nama volume, pengganti port, kontrol `E2E_*`,
dan nama rahasia yang direferensikan secara dinamis tidak seluruhnya tercakup
dalam daftar statis nama TLS berikut. Nilai environment aktual dan berkas
kredensial tidak dibaca untuk membuat inventaris ini.

## Nama TLS literal dalam source aplikasi dan perangkat pendukung

Daftar ini merupakan indeks nama, termasuk prefix, validator, dan referensi.
Kemunculan nama tidak membuktikan bahwa nama tersebut merupakan opsi konfigurasi
publik mandiri. Tautan menampilkan maksimal tiga berkas pertama yang menyebutkan
nama tersebut. Nilai rahasia tidak boleh disalin ke dokumentasi, laporan, atau Git.

| Nama | Referensi source |
| --- | --- |
| `TLS_ACTIVITY_ENABLED` | [backend/app/activity/store.py](../backend/app/activity/store.py), [scripts/dev.py](../scripts/dev.py), [scripts/provision_activity.py](../scripts/provision_activity.py) |
| `TLS_BIND_HOST` | [backend/app/run.py](../backend/app/run.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_COVERAGE_BUILD` | [scripts/check_coverage.py](../scripts/check_coverage.py) |
| `TLS_COVERAGE_DIRECTORY` | [scripts/check_coverage.py](../scripts/check_coverage.py) |
| `TLS_DATABASE_URL` | [backend/app/config.py](../backend/app/config.py), [scripts/activate_intake_ledger.py](../scripts/activate_intake_ledger.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_FIXTURE_FONT_FAMILY` | [backend/app/config.py](../backend/app/config.py) |
| `TLS_FIXTURE_FONT_PATH` | [backend/app/config.py](../backend/app/config.py) |
| `TLS_FRONTEND_DIST` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_INTAKE_DATABASE_URL` | [backend/app/label_intake/runtime.py](../backend/app/label_intake/runtime.py), [scripts/activate_intake_ledger.py](../scripts/activate_intake_ledger.py) |
| `TLS_INTAKE_HMAC_` | [backend/app/label_intake/runtime.py](../backend/app/label_intake/runtime.py) |
| `TLS_INTAKE_HMAC_K1` | [scripts/activate_intake_ledger.py](../scripts/activate_intake_ledger.py) |
| `TLS_INTAKE_LEDGER_JSON` | [backend/app/label_intake/runtime.py](../backend/app/label_intake/runtime.py), [scripts/activate_intake_ledger.py](../scripts/activate_intake_ledger.py) |
| `TLS_INTAKE_POLICY_JSON` | [backend/app/label_intake/policy.py](../backend/app/label_intake/policy.py), [scripts/provision_management.py](../scripts/provision_management.py) |
| `TLS_INTAKE_TOKEN_` | [backend/app/label_intake/policy.py](../backend/app/label_intake/policy.py) |
| `TLS_MANAGEMENT_ENABLED` | [backend/app/management/store.py](../backend/app/management/store.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_MANAGEMENT_KEY_ENCRYPTION` | [backend/app/management/integrations/key_encryption.py](../backend/app/management/integrations/key_encryption.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_MINIO_ACCESS_KEY` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_MINIO_BUCKET` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_MINIO_ENDPOINT` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_MINIO_SECRET_KEY` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_MINIO_SECURE` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_PRINTER_HOST` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_PRINTER_PORT` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_RENDERER_PATH` | [backend/app/config.py](../backend/app/config.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_SAP_RFC_ENABLED` | [backend/app/sap_rfc/runtime.py](../backend/app/sap_rfc/runtime.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_SAP_RFC_FUNCTIONS` | [backend/app/sap_rfc/runtime.py](../backend/app/sap_rfc/runtime.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_SAP_RFC_PYTHON` | [backend/app/sap_rfc/runtime.py](../backend/app/sap_rfc/runtime.py), [scripts/dev.py](../scripts/dev.py) |
| `TLS_SAP_RFC_TARGETS` | [backend/app/sap_rfc/runtime.py](../backend/app/sap_rfc/runtime.py), [scripts/dev.py](../scripts/dev.py) |

## Antrean SAP asinkron

| Batas | Source aktif |
| --- | --- |
| POST/GET `/api/v2/label-intake` dan API operator `/api/v1/sap-requests` | `backend/app/intake_queue/http.py` |
| Transaksi antrean, ledger bersama, retensi, dan kepemilikan printer | `backend/app/intake_queue/store.py`, `printers.py` |
| Enkripsi payload dan supervisor dua worker Linux | `backend/app/intake_queue/crypto.py`, `runtime.py`, `worker.py` |
| Lightweight committed-heartbeat health probe | `backend/app/intake_queue/health.py` |
| Isolated local Linux acceptance harness | `deploy/queue-local-test/` |
| Migrasi eksplisit | `backend/schema/009_intake_queue.sql` |
| Layar operator | `frontend/src/features/sap-requests/` |
| Deployment dan pemulihan | `deploy/`, `scripts/queue_operations.py`, `scripts/production_backup.py`, `scripts/production_restore.py` |

Kontrak dan gerbang penerimaan: [Production queue](PRODUCTION_QUEUE.md).
