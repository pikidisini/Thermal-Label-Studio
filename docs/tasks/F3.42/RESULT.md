# F3.42 Result — Feature ownership batch aplikasi dan shell

## Architecture map

| Domain | Owner setelah F3.42 | Shell caller | Catatan |
| --- | --- | --- | --- |
| Template lifecycle | `features/templates/{hooks,ui}` | `AuthenticatedStudio`, `TopMenuBar` | Memiliki manager, selector, dan save modal. |
| Simulation/SAP shadow | `features/simulation/{api,hooks,ui}` | `AuthenticatedStudio` | Memiliki thermal simulation, Safe Demo, SAP shadow API/modal. API lama menjadi re-export kompatibel untuk test/caller lama. |
| Print UI | `features/print/ui` | `AuthenticatedStudio` | Print modal dan tiga tab dipindahkan; API render/print tetap generic karena juga diekspos oleh `apiClient` dan menyentuh boundary hardware/export. |

## Perubahan

- Template selector, save modal, dan lifecycle manager dipindahkan ke feature Templates serta diekspos dari public barrel.
- Thermal preview hook, Safe Demo, SAP Shadow modal, dan kedua API simulation dipindahkan ke feature Simulation. Adapter `utils/api/*` hanya me-reexport public API agar import lama/test tidak putus.
- Print modal, Direct TCP, spooler, dan export tab dipindahkan ke feature Print melalui public barrel.
- Layout shell tetap generik; tidak ada perubahan UI, handler, test ID, endpoint, kontrak backend, atau policy keamanan.

## Audit yang ditahan

- `renderApi`, `printApi`, dan `apiClient` tidak dipindahkan: dipakai lintas-domain dan merupakan boundary transport/hardware. Memindahkannya sekarang akan mencampur owner generic API dengan UI Print dan berisiko mengubah jalur printer.
- Canvas/editor shell, stores, serta modal generik tetap tidak dipindahkan sesuai scope.

## Validasi

| Pemeriksaan | Status | Bukti |
| --- | --- | --- |
| TypeScript penuh | PASS | `frontend/node_modules/.bin/tsc.cmd --noEmit` tidak menghasilkan diagnostic. |
| Test frontend penuh | BLOCKED | Runner memuat Fabric/jsdom dan gagal karena `frontend/node_modules/canvas/build/Release/canvas.node` tidak ada; structural test F3.42 lulus 7/7. |
| Vite build | PASS | Vite lulus dengan 1.887 modul. Advisory Fabric dynamic/static import dari F3.41 tetap non-failing. |
| `git diff --check` | PASS | Tidak ada error whitespace; hanya warning CRLF worktree yang sudah ada. |
| Audit import legacy aktif | PASS | Tidak ada caller source ke lokasi legacy yang dipindahkan. Dua API simulation legacy tetap adapter re-export kompatibel. |

Tidak ada commit, push, deployment, restart/stop service, atau perubahan backend dalam F3.42.
