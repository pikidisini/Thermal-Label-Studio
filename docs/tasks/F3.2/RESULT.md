# Fase 3.2 — Hasil sementara Jenkins lokal

Tanggal: 2026-09-24. Branch: `codex/f3-2-jenkins-local-simulation`, baseline `origin/main` `04bb368`. Writer: Codex. Working tree belum di-commit atau di-push; folder `output/` dan folder temp pytest lama adalah data lokal yang tidak disentuh dan kini di-ignore agar tidak masuk checkpoint.

## Status

`JENKINS_RUNNING; PIPELINE_JOB_NOT_CONFIGURED; APP_NOT_DEPLOYED`. Ini bukan bukti CI/CD otomatis telah selesai. Setup wizard Jenkins, credential, job SCM, dan build pertama masih perlu dilakukan di UI Jenkins. Tidak ada PR atau merge.

## Implementasi

- Image Jenkins khusus berisi Python, Node/npm, Docker CLI; Docker Compose mem-publish UI hanya di `127.0.0.1:8081` dan menyimpan state di volume terpisah.
- `Jenkinsfile` membaca `main`, menjalankan full backend tests, frontend build/tests/typecheck, membuat image ber-tag commit, lalu hanya commit HEAD `main` boleh deploy. Job rollback manual memakai `Jenkinsfile.rollback`.
- Deploy script menguji image kandidat tanpa port/volume live, termasuk health dan penolakan rute cetak fisik; mempertahankan volume data simulasi, mem-publish aplikasi hanya di `127.0.0.1:8000`, dan mencoba pemulihan image lama bila instance baru gagal.
- `LOCAL_SIMULATION_ONLY=true` menolak endpoint legacy `/api/v1/print/*` dan `/api/v1/sap/print` sebelum parsing body. Implementasi ditempatkan di ASGI middleware yang sudah ada agar streaming upload guard tetap menghasilkan HTTP 413.
- Docker build context mengecualikan `.env`, data runtime, `output/`, dan folder pytest sementara. Tidak ada kredensial di source.

## Bukti aktual

- Docker Compose config: PASS.
- Jenkins image build: PASS. Container `thermal-label-jenkins-local`: RUNNING; host port yang terverifikasi `127.0.0.1:8081`. GET `/login`: HTTP 200. Python 3.13, Node 20, npm 10, Docker CLI ke Engine 29.8 terverifikasi di container.
- Aplikasi image `tls-local-sim:preflight`: build PASS. Container disposable tanpa published port: `/health` 200, `POST /api/v1/print/tcp` 404, `SAP_SHADOW_SIMULATION_ENABLED=true`, `SAFE_DEMO_MODE=false`. Container disposable dihapus; image preflight dipertahankan.
- Backend full suite Windows: `440 passed, 21 skipped, 2 warnings` (136.14 detik). Tes terarah guard + unggah 413: `3 passed`.
- Frontend unit: `74 passed`; TypeScript `--noEmit`: PASS. Build frontend: PASS melalui Docker application build.
- Bash syntax check pada `deploy-local.sh`: PASS. `git diff --check`: PASS; direct whitespace scan file baru: PASS.
- Jenkins Pipeline parser/build job: NOT RUN (setup admin/plugins/job belum selesai). Rollback runtime: NOT RUN. Deployment aplikasi live: NOT RUN. SAP, database perusahaan, dan printer fisik: NOT RUN.

## Risiko dan tindakan berikutnya

1. Jenkins diberi hak Docker socket yang setara kontrol administratif atas Docker host. Jangan izinkan job atau PR dari pihak tidak tepercaya; UI tetap loopback.
2. Credential operator harus dimasukkan pengguna langsung ke Jenkins. Sampai itu selesai, deploy sengaja fail-closed.
3. Job `main` tidak akan menemukan Jenkinsfile sampai branch ini direview dan di-merge. Setelah merge, jalankan job pertama secara manual; polling berikutnya otomatis.
4. Tindakan pengguna berikutnya: selesaikan wizard admin Jenkins di `http://127.0.0.1:8081` tanpa membagikan password awal atau credential ke chat. Lihat `docs/deployment/jenkins_local_simulation.md`.
