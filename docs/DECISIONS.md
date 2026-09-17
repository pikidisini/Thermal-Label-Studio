# Architecture Decisions — Thermal Label Studio

Dokumen ini menyimpan keputusan yang harus tetap konsisten antar-sesi AI dan antar-perangkat.

## ADR-001 — Repository web menjadi proyek aktif

- Status: accepted
- Keputusan: `web_app` dikelola sebagai repository terpisah dan menjadi sumber utama pengembangan aktif.
- Alasan: web application memiliki siklus pengembangan, test, dokumentasi, dan kebutuhan deployment yang berbeda dari POC desktop.
- Konsekuensi: perubahan web dilakukan di repository `Thermal-Label-Studio`; repository root hanya digunakan sebagai referensi historis kecuali ada instruksi eksplisit.

## ADR-002 — POC desktop dipertahankan sebagai arsip pengetahuan

- Status: accepted
- Keputusan: repository root tidak dihapus dan tidak digabungkan ke repository web.
- Alasan: engine, encoder printer, rasterizer, eksperimen, dan riwayat implementasi dapat berguna untuk investigasi atau reuse di masa mendatang.
- Konsekuensi: setiap reuse harus melalui perbandingan kontrak, dependency, security boundary, dan test pada `web_app`.

## ADR-003 — File adalah konteks AI yang portable

- Status: accepted
- Keputusan: keputusan, status, dan handoff penting harus ditulis ke Markdown di repository aktif, bukan hanya disimpan dalam riwayat percakapan.
- Alasan: file dapat dibaca AI dari laptop berbeda setelah repository di-clone dan tetap menjadi bagian dari review Git.
- Konsekuensi: AI wajib memperbarui dokumentasi konteks jika task mengubah arsitektur, kontrak, workflow, atau status fitur.

## ADR-004 — Perubahan harus dapat diverifikasi

- Status: accepted
- Keputusan: setiap milestone menyertakan file yang berubah, perintah test, hasil aktual, dan sisa risiko.
- Alasan: status implementasi tidak boleh disimpulkan hanya dari kode atau klaim AI.
- Konsekuensi: gunakan label `verified`, `not run`, `blocked`, atau `assumption` jika statusnya belum terbukti.

## ADR-005 — React/Vite adalah stack frontend final

- Status: accepted
- Keputusan: frontend `web_app` menggunakan React, Vite, TypeScript, dan tooling terkait yang sudah ada di repository.
- Alasan: stack tersebut merupakan fondasi implementasi aktif Thermal Label Studio dan sesuai dengan arah pengembangan proyek.
- Konsekuensi: jangan memigrasikan frontend ke Next.js atau mengganti build tool tanpa keputusan arsitektur baru yang disetujui pengguna.
