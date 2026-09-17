# 🌐 Thermal Label Engine Web Application (Backend & API)

Layanan REST API berbasis **FastAPI** untuk merender template label SVG termal, menginjeksi data kontrak SAP JSON v1.1, menghasilkan barcode/QR vektor, binarisasi monokrom 1-bit, dan mendistribusikan instruksi native printer (Zebra ZPL II, TSC TSPL2, Intermec IPL) melalui jaringan TCP atau Windows Print Spooler.

---

## 🏗️ Struktur Direktori `web_app/`

```
web_app/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes_templates.py   # Endpoint CRUD & parsing template SVG
│   │   │   ├── routes_render.py      # Endpoint render & live streaming preview
│   │   │   ├── routes_print.py       # Endpoint kirim ke printer (TCP / Spooler)
│   │   │   └── routes_inspect.py     # Endpoint validasi schema & token SAP JSON
│   │   ├── models/
│   │   │   └── schemas.py            # Pydantic schema request/response
│   │   ├── services/
│   │   │   ├── template_service.py   # Ekstraktor token {{...}}, data-barcode, data-qr
│   │   │   ├── render_service.py     # Integrasi core engine processor & rasterizer
│   │   │   └── print_service.py      # Dispatcher TCP socket port 9100 & Spooler
│   │   ├── config.py                 # Pengaturan direktori, storage, default DPI
│   │   └── main.py                   # Inisialisasi FastAPI & CORS Middleware
│   ├── data/
│   │   ├── templates/                # Folder penyimpanan template custom upload
│   │   └── out/                      # Cache berkas hasil render
│   ├── tests/                        # Test suite pytest untuk seluruh endpoint
│   ├── run_server.py                 # Runner server mandiri (Uvicorn)
│   └── requirements.txt              # Dependensi backend
└── README.md                         # Dokumentasi ini
```

---

## 🚀 Cara Menjalankan Aplikasi

### Opsi 1: Menjalankan via Docker (Direkomendasikan)
```bash
# Dari direktori web_app/ atau root direktori
docker compose up -d --build
```
- Web UI & API otomatis tersedia di **`http://localhost:8000`**
- Interactive Swagger UI: **`http://localhost:8000/docs`**

### Opsi 2: Menjalankan Lokal (Python & Node.js)
```bash
python web_app/backend/run_server.py
```
Server backend akan berjalan di `http://127.0.0.1:8000`.

### Dokumentasi Interaktif (Swagger UI)
Buka browser dan navigasi ke:
👉 **`http://127.0.0.1:8000/docs`** atau **`http://127.0.0.1:8000/redoc`**

---

## 📑 Daftar Endpoint Utama

### 1. Template Management (`/api/v1/templates`)
- `GET /api/v1/templates`: Mendapatkan daftar semua template (built-in & custom).
- `GET /api/v1/templates/{template_id}`: Mengambil detail template, dimensi, daftar token `{{field}}`, field barcode, field QR, dan raw SVG.
- `POST /api/v1/templates/upload`: Mengunggah template SVG custom baru.
- `POST /api/v1/templates/parse-raw`: Mem-parsing raw string SVG secara on-the-fly untuk ekstraksi token.

### 2. Render & Preview (`/api/v1/render`)
- `POST /api/v1/render`: Merender data JSON + Template ke format terpilih (`png`, `pdf`, `zpl`, `tspl`, `ipl`, `bmp`, `svg`). Mengembalikan URL unduhan & teks perintah ZPL.
- `POST /api/v1/render/preview`: Menghasilkan stream gambar biner instan (`PNG`, `1-Bit Otsu Monokrom`, atau `SVG`) untuk ditampilkan langsung di elemen `<img>` web canvas.
- `GET /api/v1/render/download/{job_id}/{filename}`: Mengunduh artefak hasil render.

### 3. Printing Dispatch (`/api/v1/print`)
- `GET /api/v1/print/printers`: Menampilkan daftar printer yang terpasang di host.
- `POST /api/v1/print/tcp`: Mengirim instruksi raw bytes ke IP Printer Thermal pada Port 9100.
- `POST /api/v1/print/spooler`: Mengirim instruksi raw bytes ke Windows Print Spooler lokal/jaringan.

### 4. Data Contract Inspection (`/api/v1/inspect`)
- `GET /api/v1/inspect/sample-contract`: Mendapatkan contoh schema SAP JSON contract v1.1.
- `POST /api/v1/inspect/validate`: Memvalidasi kecocokan data JSON terhadap placeholder template tanpa perlu merender.

---

## 🧪 Menjalankan Pengujian (Unit Tests)

```bash
pytest web_app/backend/tests -v
```
Semua 14 test cases mencakup seluruh fungsionalitas route template, rendering, live preview, print dispatch (mocked), dan token validation.
