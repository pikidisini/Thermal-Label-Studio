# Kontrak Integrasi SAP: Shadow Print Simulation & Evidence PDF

Dokumen ini disusun untuk pengembang ABAP (`ZLABEL` / `ZMM_LABEL_JSON`), Basis, dan tim integrasi PPIC yang akan mengonfigurasi pengiriman payload canonical SAP JSON ke Thermal Label Studio.

---

## 1. Arsitektur Komunikasi & Push Model

```text
SAP ERP / S/4HANA (ZLABEL / ZMM_LABEL_JSON)
    │
    ▼ HTTP POST (JSON Payload via SM59 / CL_HTTP_CLIENT)
+────────────────────────────────────────────────────────+
│ Thermal Label Studio API Server                        │
│ Endpoint: POST /api/v1/simulation/sap-batches          │
│                                                        │
│ 1. Validasi Auth Header (X-SAP-Simulation-Token)       │
│ 2. Cek Feature Flag (SAP_SHADOW_SIMULATION_ENABLED)    │
│ 3. Validasi Kontrak Strict & Copies=1 (extra="forbid") │
│ 4. Resolusi Virtual Profile (server-side printer_id)   │
│ 5. Cek Idempotency (producer_namespace, request_id)    │
│ 6. Response Cepat 202 Accepted (batch_id)              │
│ 7. Simpan State Durable ke Filesystem Records          │
│                                                        │
│ [Managed Background Execution]                         │
│ 8. Real Pipeline Rendering:                            │
│    - inject_data (Pure text injection)                 │
│    - inject_barcodes_and_qr (Vector barcode/QR)        │
│    - svg_to_png (Exact media DPI & points raster)      │
│ 9. Kompilasi PDF Evidence Multi-Halaman:               │
│    - Hal 1: Cover Manifest & Audit Trail               │
│    - Hal 2..N+1: Label fisik tepat (pt) + Watermark    │
│ 10. Simpan ke Durable Storage (retensi 7 hari)         │
+────────────────────────────────────────────────────────+
    │
    ▼ Monitoring & Unduh via PPIC Web UI / REST GET
Bukti PDF Evidence (Zero physical printer socket / Spooler)
```

### Prinsip Utama
1. **Push Model**: SAP bertindak sebagai pengirim (*HTTP Client*). Label Application tidak mem-poll SAP.
2. **Pemisahan Kredensial & Fail-Closed Browser Access (P1-A)**:
   - Panel web browser **sama sekali tidak meminta, menginput, atau menyimpan** kredensial SAP.
   - Karena aplikasi saat ini belum memiliki subsistem autentikasi pengguna / SSO / enterprise RBAC, UI web PPIC dialihkan ke mode fail-closed: menampilkan informasi *"Monitoring Membutuhkan Identity Provider"* dan menegaskan bahwa monitoring UI interaktif akan dibuka pada fase access-control/RBAC berikutnya.
   - Seluruh endpoint operasional data SAP (`GET /api/v1/simulation/sap-batches`, `GET /api/v1/simulation/sap-batches/{batch_id}`, dan `GET /api/v1/simulation/sap-batches/{batch_id}/pdf`) **wajib menyertakan header `X-SAP-Simulation-Token`**. Akses browser anonim ke data operasional SAP atau berkas PDF bukti ditolak tegas dengan **HTTP 401 Unauthorized**.
   - Endpoint probe publik `GET /api/v1/simulation/status` tetap terbuka tanpa kredensial untuk health probe dan melaporkan flag status sistem.
3. **Fail-Closed & Virtual Only**: Tidak ada port 9100 atau Windows Spooler yang dibuka; sink akhir adalah PDF simulation sink.
4. **Idempotensi & Recovery Durable Terkontrol (P1-B)**:
   - Kombinasi `(producer_namespace, request_id)` disimpan ke durable storage (filesystem file-backed store `simulation_batches/`).
   - Replay dari SAP dengan ID yang sama setelah server reboot tetap terdeteksi secara persisten tanpa menghasilkan duplikasi batch atau PDF baru.
   - **Kebijakan Pemulihan Startup (Explicit Startup Recovery Policy)**: Mengadopsi *"Controlled Virtual Resume on Startup"*. Ketika aplikasi melakukan startup, service memindai storage disk untuk menemukan batch berstatus `accepted` atau `processing` yang terinterupsi saat restart, kemudian secara aman melanjutkan proses rasterisasi dan kompilasi PDF evidence hingga status `completed`.
   - **Ketahanan Write Disk**: Penulisan batch dan indeks idempotensi dilakukan secara atomik (`.tmp` -> rename). Jika terjadi kegagalan I/O disk (misal: disk penuh), transaksi di memori di-rollback dan server mengembalikan **HTTP 500 Internal Server Error**, sehingga tidak pernah terjadi false `202 Accepted` tanpa jaminan persistensi.

---

## 2. Spesifikasi Endpoint

### A. Submit Batch Simulasi
- **URL**: `POST /api/v1/simulation/sap-batches`
- **Headers Wajib**:
  - `Content-Type: application/json`
  - `X-SAP-Simulation-Token: <token_rahasia_terkonfigurasi>`

#### Request Body Schema (JSON)

```json
{
  "producer_namespace": "SAP_PPIC",
  "request_id": "REQ-20260922-1001",
  "printer_id": "PILOT-PRINTER-01",
  "items": [
    {
      "item_sequence": 1,
      "template_version_id": "label_roll_80x200",
      "copies": 1,
      "canonical_item_data": {
        "material_code": "MAT-ALUM-80200-A",
        "material_desc": "Aluminium Foil Roll 80x200 Grade A",
        "batch_number": "BAT-2026-X01",
        "roll_number": "ROLL-001-A",
        "gross_weight": "12.50 KG",
        "net_weight": "12.10 KG",
        "production_date": "2026-09-22"
      }
    },
    {
      "item_sequence": 2,
      "template_version_id": "label_roll_80x200",
      "copies": 1,
      "canonical_item_data": {
        "material_code": "MAT-ALUM-80200-B",
        "material_desc": "Aluminium Foil Roll 80x200 Grade B",
        "batch_number": "BAT-2026-X02",
        "roll_number": "ROLL-002-B",
        "gross_weight": "15.80 KG",
        "net_weight": "15.40 KG",
        "production_date": "2026-09-22"
      }
    }
  ],
  "source_metadata": {
    "werks": "1100",
    "lgort": "0001",
    "sap_user": "M_PPIC",
    "system_id": "PRD",
    "transaction_code": "ZLABEL"
  }
}
```

#### Aturan Validasi Field
| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `producer_namespace` | String | Ya | Namespace produsen SAP (maks 64 char, alfanumerik + `_`, `-`). Contoh: `SAP_PPIC`, `SAP_WM`. |
| `request_id` | String | Ya | Kunci idempotensi unik dari transaksi SAP (maks 128 char). Pengiriman ulang dengan ID yang sama mengembalikan batch yang ada tanpa menduplikasi artefak. |
| `printer_id` | String | Ya | ID printer logis pada registry virtual server (contoh: `PILOT-PRINTER-01`, `VIRTUAL-THERMAL-01`). Dilarang membawa IP host atau port. |
| `items` | Array | Ya | Daftar item label (min 1, maks 100). |
| `items[].item_sequence` | Integer | Ya | Nomor urut label (1, 2, 3...) — wajib unik dalam 1 batch. |
| `items[].template_version_id`| String | Ya | ID template SVG yang terdaftar di sistem. Dimensi template harus cocok dengan media profile printer virtual. |
| `items[].copies` | Integer | Tidak | **Wajib bernilai `1`** (`Literal[1]`). Nilai selain 1 ditolak dengan HTTP 422 (P2-2). |
| `items[].canonical_item_data`| Object | Ya | Skema kanonikal strict (P2-1) berisi fields dan codes yang divalidasi. Extra field dilarang. |
| `source_metadata` | Object | Tidak | Metadata audit terbatas (`werks`, `lgort`, `sap_user`, `system_id`, `transaction_code`). Extra field dilarang. |

---

## 3. Pemetaan Placeholder Template (`label_roll_80x200.svg`)

Renderer mengeksekusi pipeline nyata (*real rendering pipeline*) dengan menyuntikkan field canonical ke placeholder SVG berikut:

| Placeholder Template | Field Asal Canonical SAP | Contoh Nilai |
|---|---|---|
| `{{brand}}` | `brand` | `POLYTRON` |
| `{{type_film}}` | `type_film` atau `material_desc` | `ALUMINIUM FOIL ROLL 80x200` |
| `{{base_film}}` | `base_film` | `PET FILM` |
| `{{batch_text}}` | `batch_text` atau `batch_number` | `BAT-2026-X01` |
| `{{roll_no}}` | `roll_no` atau `roll_number` | `ROLL-001-A` |
| `{{width_mm}}` | `width_mm` | `80` |
| `{{length_m}}` | `length_m` | `2000` |
| `{{gross_weight_kg}}` | `gross_weight_kg` atau `gross_weight` | `12.50` |
| `{{net_weight_kg}}` | `net_weight_kg` atau `net_weight` | `12.10` |
| Barcode 1D (Code128) | `batch_barcode` atau `batch_number` | `BAT-2026-X01` |
| Barcode 1D Roll | `roll_barcode` atau `roll_number` | `ROLL-001-A` |
| QR Matrix 2D | `qr_payload` atau gabungan data | `MAT:MAT-01;BAT:BAT-01;ROL:ROL-01` |

---

## 4. Polling Status & Pengambilan PDF Evidence (Service-to-Service Token Required)
Seluruh endpoint operasional berikut mewajibkan header autentikasi `X-SAP-Simulation-Token`. Akses tanpa header yang cocok akan ditolak dengan `HTTP 401 Unauthorized`.

### A. List Batch Simulasi
- **URL**: `GET /api/v1/simulation/sap-batches`
- **Headers Wajib**: `X-SAP-Simulation-Token: <token>`
- **Response**: Array batch simulasi terbaru terurut `created_at DESC`.

### B. Cek Status Batch Tertentu
- **URL**: `GET /api/v1/simulation/sap-batches/{batch_id}`
- **Headers Wajib**: `X-SAP-Simulation-Token: <token>`
- **Response**: Detail batch, status item berurutan, dan metadata artefak PDF.

### C. Unduh File PDF Evidence
- **URL**: `GET /api/v1/simulation/sap-batches/{batch_id}/pdf`
- **Headers Wajib**: `X-SAP-Simulation-Token: <token>`
- **Response**: Binary stream `application/pdf`.
- **Karakteristik Dokumen**:
  - Halaman 1: Cover/Manifest berisi metadata batch, audit timestamp, SHA-256 digest, dan tabel urutan item.
  - Halaman 2..N+1: Label fisik berurutan menurut `item_sequence ASC` dengan ukuran typographic points tepat (`width_mm / 25.4 * 72`).
  - Watermark: Teks diagonal dan banner pengaman `"SIMULASI — BUKAN UNTUK CETAK FISIK"`.

---

## 5. Contoh Implementasi ABAP Sederhana (`CL_HTTP_CLIENT`)

```abap
DATA: lo_http_client TYPE REF TO if_http_client,
      lv_url         TYPE string VALUE 'http://<label_server>:8000/api/v1/simulation/sap-batches',
      lv_json        TYPE string,
      lv_token       TYPE string VALUE '<configured_token>',
      lv_response    TYPE string,
      lv_status      TYPE i.

" 1. Inisialisasi HTTP Client via URL
cl_http_client=>create_by_url(
  EXPORTING
    url    = lv_url
  IMPORTING
    client = lo_http_client
).

" 2. Set Method & Headers
lo_http_client->request->set_method( 'POST' ).
lo_http_client->request->set_header_field( name = 'Content-Type' value = 'application/json' ).
lo_http_client->request->set_header_field( name = 'X-SAP-Simulation-Token' value = lv_token ).

" 3. Set Request Body JSON (Canonical SAP Payload)
lv_json = '{"producer_namespace":"SAP_PPIC","request_id":"REQ-001","printer_id":"PILOT-PRINTER-01","items":[{"item_sequence":1,"template_version_id":"label_roll_80x200","copies":1,"canonical_item_data":{"material_code":"MAT-ALUM-80200-A","batch_number":"BAT-2026-X01","roll_number":"ROLL-001-A","gross_weight":"12.50 KG","net_weight":"12.10 KG"}}]}'.
lo_http_client->request->set_cdata( lv_json ).

" 4. Kirim Request
lo_http_client->send( ).
lo_http_client->receive( ).

" 5. Ambil Kode Status & Body
lo_http_client->response->get_status( IMPORTING code = lv_status ).
lv_response = lo_http_client->response->get_cdata( ).

IF lv_status = 202 OR lv_status = 200.
  " Simpan batch_id untuk tracking di SAP
ELSE.
  " Tangani error
ENDIF.

lo_http_client->close( ).
```

---

## 6. Impor Raw JSON Lokal untuk Simulasi Toleran

Jalur UI **Impor JSON dari SAP** (`POST /api/v1/simulation/operator/import-json`) adalah jalur simulasi lokal, bukan endpoint integrasi produksi. Untuk membantu PPIC melihat layout meskipun sebagian fakta SAP tidak tersedia, jalur ini menjalankan validasi N001 dengan mode `simulation_tolerant` yang eksplisit:

- Fakta display yang hilang karena tidak ada, `null`, atau string kosong/whitespace ditampilkan sebagai `--` dan dicatat sebagai warning yang aman (`item_sequence`, nama field, alasan); batch dan PDF tetap diproses.
- Nilai numerik yang hilang atau tidak valid tidak dipakai untuk derivasi. Field turunannya juga menjadi `--`; aplikasi tidak mengarang nilai bisnis.
- Jika bagian barcode/QR tidak punya data sumber yang valid, simbol barcode/QR tidak dibuat dari `--`. Warning tetap ditampilkan; tidak ada payload kode palsu.
- Berkas raw SAP yang diarsipkan dalam batch tidak dimutasi; `--` hanya nilai presentasi hasil adaptasi simulasi.
- Warning tampil setelah impor dan pada daftar/rincian batch. Error fatal (payload/schema rusak, template tidak valid, kegagalan rendering) tetap menghentikan batch dan ditampilkan sebagai error.

Mode toleran ini **hanya** diaktifkan pada endpoint impor JSON lokal oleh UI. Adapter N001 default, endpoint machine-to-machine `POST /api/v1/simulation/sap-batches`, dispatcher, dan semua jalur produksi tetap strict/fail-closed. Mengirim string `--` dari SAP tidak menjadikannya fakta bisnis yang sah dan tidak memberi izin untuk melewati validasi produksi.
