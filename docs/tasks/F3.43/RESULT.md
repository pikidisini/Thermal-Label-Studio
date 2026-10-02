# F3.43 Result — Ownership Data Tokens, Diagnostics, dan Auth UI

## Architecture map

| Domain | Owner baru | Caller | Catatan |
| --- | --- | --- | --- |
| Data Tokens/SAP import | `features/data-tokens/{model,ui}` | Studio, Toolbox, Template/Barcode action | Memiliki adapter kontrak, resolver token, parser JSON lokal, dan UI token. Legacy utils adalah re-export kompatibel untuk store/caller lama. |
| Diagnostics | `features/diagnostics/{model,ui}` | `main.tsx`, Studio | Memiliki recorder, generator report, dan modal. Legacy utils adalah re-export kompatibel. |
| Auth UI/API | `features/auth/{api,ui}` | App, shared auth store | Login UI dan client API dipindahkan; Zustand store tetap shared dan server behavior tidak berubah. |

## Canvas Setup audit

`CanvasSetupModal` ditahan pada generic modal shell. Import graph-nya mengatur mode `new`/`resize` dan mendelegasikan aksi lifecycle template/canvas ke `AuthenticatedStudio`; ia bukan editor Canvas yang mandiri. Memindahkannya sekarang akan mencampur owner Canvas dengan Template lifecycle dan mengubah boundary shell.

## Validasi

| Pemeriksaan | Status | Bukti |
| --- | --- | --- |
| TypeScript penuh | PASS | `tsc --noEmit` tanpa diagnostic. |
| Structural boundary test | PASS | 8/8 boundary checks lulus. |
| Test frontend penuh | NOT RUN | Perintah terakhir salah directory (`web_app` tanpa package.json); rerun sengaja ditinggalkan untuk reviewer agar tidak mengulang blocker native Canvas yang tercatat F3.42. |
| Vite build | PASS | Vite build lulus dengan 1.892 modul. |
| `git diff --check` | PASS | Tidak ada error whitespace; warning CRLF worktree lama saja. |
| Audit import legacy aktif | PASS | Tidak ada caller feature/shell ke lokasi legacy; `useContractStore` tetap memakai adapter kompatibilitas shared. |

Tidak ada perubahan backend, endpoint, security server, Docker, commit, push, deployment, atau restart service.
