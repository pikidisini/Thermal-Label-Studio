# Workflow AI Hemat Biaya

Dokumen ini menjelaskan cara memakai Codex dan Antigravity tanpa perlu menyalin percakapan panjang.

## Prinsip utama

1. Satu branch hanya memiliki satu penulis aktif.
2. GitHub dan file repository adalah sumber konteks, bukan riwayat chat.
3. Model mahal dipakai untuk keputusan berisiko tinggi, bukan pekerjaan rutin.
4. Setiap hasil dinilai dari acceptance criteria dan test, bukan nama model.

## Siapa mengerjakan apa

| Level | Contoh | Planner/reviewer | Executor utama |
|---|---|---|---|
| 0 | typo, format, dokumentasi kecil | tidak wajib | Gemini Flash atau Luna |
| 1 | fitur lokal risiko rendah | Luna/Terra bila perlu | Gemini Flash |
| 2 | integrasi beberapa modul | Terra | Gemini Flash |
| 3 | database, security, concurrency, migration | Sol High; Terra untuk pre-review | Gemini Flash |
| 4 | production, credential, printer fisik, tindakan destruktif | keputusan pengguna | belum boleh berjalan |

Codex dapat memilih subagent internal sesuai konfigurasi `.codex/`. Perpindahan ke Gemini di Antigravity tetap dilakukan secara manual karena kedua aplikasi tidak saling mengendalikan.

## Alur kerja

### 1. Mulai task di Codex

Pengguna cukup menjelaskan tujuan dengan bahasa biasa. Codex menentukan level risiko, membuat task contract bila perlu, dan memberi satu instruksi berikutnya.

### 2. Eksekusi panjang di Antigravity

Hanya untuk Level 1–3 ketika Gemini dipilih sebagai executor:

1. Codex memastikan perubahan saat ini sudah menjadi safe checkpoint dan dipush.
2. Codex menetapkan Gemini sebagai penulis aktif di `TASK_CONTRACT.md`.
3. Pengguna membuka repository dan branch yang disebutkan di Antigravity.
4. Pengguna mengirim satu kalimat:

   `Baca AGENTS.md dan docs/tasks/<TASK_ID>/TASK_CONTRACT.md, lalu kerjakan sampai acceptance criteria terpenuhi. Isi RESULT.md dan berhenti sebelum merge.`

Gemini harus membaca konteks dari repository; pengguna tidak perlu menyalin percakapan.

### 3. Kembali ke Codex untuk review

Setelah Gemini commit dan push, pengguna mengirim ke Codex:

`Review hasil task <TASK_ID> dari branch yang tercatat di RESULT.md. Jangan merge.`

Terra melakukan pre-review. Sol High hanya dipakai pada Level 3 atau jika ditemukan risiko serius. Hasil review ditulis ke `REVIEW.md`.

### 4. Merge

Merge hanya dilakukan setelah quality gate lulus, review menyatakan siap, dan pengguna memberi persetujuan eksplisit.

## Kapan folder task dibuat

Folder task dibuat untuk Level 2/3, pekerjaan multi-sesi, atau handoff lintas provider. Subfase kecil tetap dicatat dalam folder fase induk. Perbaikan ringan cukup dicatat dalam commit/PR dan tidak perlu folder baru.

Struktur standar:

```text
docs/tasks/<TASK_ID>/
  TASK_CONTRACT.md
  RESULT.md
  REVIEW.md
```

## Status yang digunakan

- `PLANNED`: belum mulai.
- `IN_PROGRESS`: sedang dikerjakan oleh satu writer.
- `PAUSED`: sengaja dihentikan sementara.
- `BLOCKED`: tidak dapat lanjut tanpa perubahan eksternal atau keputusan pengguna.
- `READY_FOR_REVIEW`: implementasi selesai, belum disetujui reviewer.
- `READY_FOR_MERGE`: review dan quality gate lulus, menunggu persetujuan merge.
- `DONE`: sudah masuk branch tujuan.

## Format jawaban kepada pengguna

Jawaban normal cukup memuat:

- **Hasil:** ringkasan sederhana.
- **Yang perlu Anda lakukan:** satu tindakan yang jelas, atau pernyataan bahwa tidak ada tindakan.

Detail teknis disimpan di repository dan hanya diringkas ketika diperlukan.
