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

## ADR-006 — GitHub adalah source of truth lintas perangkat dan provider

- Status: accepted
- Keputusan: repository `Thermal-Label-Studio` menjadi sumber kebenaran untuk source code, dokumentasi, keputusan, dan test source.
- Alasan: laptop, handphone, Antigravity, Claude Desktop, dan Codex tidak berbagi working tree atau riwayat percakapan secara otomatis.
- Konsekuensi: pekerjaan harus dipindahkan melalui branch, commit, push, dan file handoff; jangan mengandalkan copy folder atau riwayat chat sebagai mekanisme sinkronisasi.

## ADR-007 — Satu penulis aktif per branch

- Status: accepted
- Keputusan: hanya satu AI/perangkat menjadi penulis aktif pada satu branch pada satu waktu.
- Alasan: dua proses AI yang mengubah branch yang sama dapat menghasilkan konflik, overwrite, atau konteks yang tidak konsisten.
- Konsekuensi: pekerjaan paralel menggunakan branch fitur terpisah dan digabungkan setelah review diff serta test.

## ADR-008 — Handoff wajib memuat identitas sesi

- Status: accepted
- Keputusan: setiap handoff mencatat tanggal, provider, perangkat, repository, branch, commit dasar, status working tree, scope, test, dan blocker.
- Alasan: konteks percakapan tidak portable secara konsisten antar-provider dan antarperangkat.
- Konsekuensi: provider berikutnya harus memverifikasi handoff terhadap Git sebelum mengubah file.

## ADR-009 — Artefak generated tidak menjadi source repository

- Status: accepted
- Keputusan: script test, fixture, snapshot regression yang diperlukan, dan dokumentasi test disimpan; report, screenshot hasil test, `.last-run.json`, recording, dan artefak sementara di-ignore.
- Alasan: artefak generated memperbesar repository dan tidak diperlukan untuk mereproduksi test.
- Konsekuensi: hasil test diringkas di handoff atau CI; file generated tetap boleh ada secara lokal.
