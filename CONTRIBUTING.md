# 🤝 Panduan Kontribusi & Protokol AI Agent (Thermal Label Studio)

Dokumen ini menjelaskan alur kerja, standar penulisan kode, dan protokol keamanan yang wajib diikuti oleh pengembang (manusia maupun AI Agent) saat memodifikasi repositori ini.

---

## 🌳 1. Strategi Percabangan (Branching Strategy)

- **Branch Utama (`main`)**: Hanya berisi kode stabil yang telah lolos semua status checks (CI). Tidak boleh melakukan commit langsung (`direct push`) ke `main`.
- **Branch Fitur (`feature/*`)**: Untuk implementasi fitur atau endpoint baru (contoh: `feature/cad-ruler-snap`).
- **Branch Perbaikan (`fix/*`)**: Untuk perbaikan bug atau error (contoh: `fix/tspl-bitmap-rotation`).
- **Branch Dokumentasi (`docs/*`)**: Untuk pembaruan panduan atau README.

---

## ✍️ 2. Konvensi Pesan Commit (Conventional Commits)

Gunakan format commit standar: `<tipe>(<lingkup>): <deskripsi singkat>`

- `feat`: Penambahan fitur atau endpoint baru.
- `fix`: Perbaikan bug atau penanganan error.
- `test`: Penambahan atau pembaruan unit test / e2e test.
- `refactor`: Perubahan struktur kode tanpa mengubah fungsi luar.
- `chore`: Pembaruan build, dependency, atau konfigurasi CI/CD.
- `docs`: Dokumentasi, diagram, atau komentar inline.

**Contoh:**
```bash
git commit -m "feat(api): add batch printing endpoint with pagination"
git commit -m "test(frontend): add fabric canvas zoom math test cases"
```

---

## 🧪 3. Pengujian Lokal Wajib Sebelum Membuat PR

Setiap perubahan wajib lolos pengujian lokal sebelum branch di-push ke remote:

### Backend Tests (Python Pytest):
```bash
PYTHONPATH=. pytest backend/tests -v
```

### Frontend Tests (Node test runner):
```bash
cd frontend
npm install
node --test tests/test_frontend.mjs
npm run build
```

---

## 🔒 4. Keamanan & Kebersihan Repositori

1. **Dilarang keras mengunggah credentials**: Token API, password database, private keys, dan file `.env` tidak boleh di-commit.
2. **Bersihkan Artefak Build**: Jangan mengunggah `__pycache__`, `.pytest_cache`, `.history`, `node_modules`, atau file temporary render di `backend/data/out`.
3. **Validasi Kontrak Data**: Setiap perubahan pada payload SAP JSON harus mempertahankan kompatibilitas mundur (*backward compatibility*).
