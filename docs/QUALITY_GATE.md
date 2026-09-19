# Quality Gate — Thermal Label Studio

Dokumen ini berisi pemeriksaan detail yang dirujuk oleh `AGENTS.md`. Gunakan hanya kategori yang relevan dengan scope task dan laporkan hasil aktual.

## Evidence label

- `verified`: perintah/check benar-benar dijalankan dan hasilnya tersedia.
- `not run`: belum dijalankan.
- `blocked`: tidak dapat dijalankan; tulis penyebabnya.
- `assumption`: dugaan yang belum dibuktikan.

Jangan menyebut fitur production-ready jika quality gate, security, observability, backup, dan rollback belum dievaluasi.

## Test matrix minimum

### Backend/API

- happy path dan response contract;
- invalid input dan malformed JSON;
- missing resource, empty state, dan error response;
- authentication, authorization, ownership, dan permission denied;
- duplicate submission dan concurrent update;
- network/API failure dan timeout;
- file upload abuse jika ada upload;
- print job state transition, retry, lease/claim expiry, dan idempotency;
- isolasi artefak hasil render serta validasi path download.

Perintah dari folder `web_app/`:

```bash
pytest backend/tests -v
```

Untuk perubahan repository PostgreSQL, gunakan database **disposable** dan
berikan DSN hanya melalui environment lokal:

```powershell
$env:TEST_POSTGRES_DSN='postgresql://<disposable-local-dsn>'
python -m pytest backend/tests/test_postgres_print_agent_repository.py -q -p no:cacheprovider
python -m pytest backend/tests -q -p no:cacheprovider
```

Migration baseline harus dijalankan eksplisit melalui
`python -m backend.app.print_jobs.migrations apply`; aplikasi dilarang melakukan
migration otomatis saat startup. Jangan arahkan test atau migration verification
ke database staging/production.

### Frontend

- render/loading/empty/error/success state;
- interaksi canvas, selection, undo/redo, zoom, dan resize;
- validasi token SAP, barcode/QR, template, dan export;
- keyboard navigation, focus state, semantic HTML, dan contrast;
- responsive/mobile viewport dan touch interaction;
- API failure tanpa mengirim print job yang tidak diinginkan.

Perintah dari folder `web_app/frontend/`:

```bash
npm test
npm run build
npm run test:e2e
```

Jalankan `npm run test:e2e` hanya jika backend/test server dan dependency browser sudah tersedia.

## Security review

Periksa sebelum menyatakan milestone selesai:

- tidak ada secret atau `.env` yang ter-track;
- input, URL, file, webhook, dan payload API divalidasi;
- authorization server-side untuk setiap resource sensitif;
- path traversal, arbitrary file access, XSS, injection, dan unsafe redirect;
- rate limit/abuse protection untuk endpoint publik atau print;
- data sensitif tidak masuk log, screenshot, report, atau error response;
- dependency dan lockfile konsisten.

## Generated artifact policy

Simpan di Git:

- script test;
- test fixture dan input reproducible;
- snapshot visual yang benar-benar dipakai regression test;
- dokumentasi test dan keputusan.

Jangan simpan di Git:

- `playwright-report/`;
- `test-results/`;
- `frontend/playwright-report/`;
- `frontend/test-results/`;
- `.last-run.json`;
- screenshot hasil eksekusi test;
- recording sementara;
- file build/generated yang tidak diperlukan untuk reproducibility.

## Definition of Done

Task dapat disebut selesai jika:

1. scope dan acceptance criteria terpenuhi;
2. error/loading/empty state relevan tersedia;
3. test relevan dijalankan atau statusnya jelas `not run`/`blocked`;
4. security review relevan dilakukan;
5. dokumentasi dan `AI_HANDOFF.md` diperbarui;
6. diff tidak berisi perubahan tak sengaja atau secret;
7. commit message menjelaskan milestone dan branch siap dipindahkan ke perangkat/provider lain.
