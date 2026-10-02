# F3.40 Result — writer implementation

## Perubahan

- Hook aksi Text sekarang berada di `features/text/hooks/useTextActions.ts`.
- Daftar dan tipe font dipusatkan di `features/text/model/fontOptions.ts`; `TextFormatControls` memakai sumber yang sama melalui feature Text.
- Compatibility wrapper `components/layout/ribbon/TextFormatControls.tsx` dihapus karena tidak lagi memiliki caller aktif.
- `AnchoredOverlay` tetap berada pada `shared/ui/layers`, sedangkan format UI, font preview, dan font picker tetap pada `features/text/ui`.
- Test struktur memastikan ownership Text, font model, dan public import tetap terjaga.

## Validasi writer

| Gate | Hasil |
| --- | --- |
| `npm.cmd exec tsc -- --noEmit` | PASS |
| `npm.cmd test` | PASS — 131 test lulus |
| `npm.cmd run build` | PASS — 1.878 module ditransformasikan |
| `git diff --check` | PASS |
| Pencarian import Text lama | PASS — tidak ada source import aktif |

## Batasan

Tidak ada perubahan behavior Text, font list/preview/dropdown, dynamic binding, SVG export, UI test id, atau feature lain. Tidak ada commit, push, deploy, maupun service restart.
