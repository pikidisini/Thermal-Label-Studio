# Inventaris Asset Renderer Internal

Status: **INTERNAL_APPROVED** untuk kandidat uji internal.

Asset ini disetujui berdasarkan keputusan pemilik proyek pada 2026-10-25. Persetujuan ini menetapkan archive yang sudah ada di workspace sebagai asset internal yang dipakai untuk pengujian dan kandidat build; ini bukan klaim bahwa checksum berasal dari vendor.

| Field | Nilai |
|---|---|
| Komponen | `resvg` Linux `amd64` |
| Versi binary | `0.44.0` |
| Archive | `.tmp/renderer/resvg-linux-x86_64.tar.gz` |
| SHA-256 archive | `450cfeaf8122f7389a8acf698888804e1ed46980b611d5253204049c51c87087` |
| Binary disposable | `.tmp/renderer/extracted/resvg` |
| Sumber | Asset internal yang sudah tersedia di workspace |
| Kunci verifikasi | SHA-256 lokal; nilai vendor tidak tersedia |
| Penggunaan | Runner Linux dan kandidat build uji internal |
| Batasan | Tidak membuktikan provenance vendor, deployment, SAP ECC, atau printer fisik |

## Cara memverifikasi ulang

Jalankan dari root aplikasi:

```powershell
Get-FileHash .tmp/renderer/resvg-linux-x86_64.tar.gz -Algorithm SHA256
```

Runtime Linux diverifikasi pada runner terisolasi dengan `resvg --version` dan satu rendering SVG fixture. Binary Linux tidak dijalankan langsung dari Windows; pengujian runtime harus memakai container Linux.

Archive dan binary berada di bawah `.tmp/` dan tidak boleh dimasukkan ke Git. Jika asset diganti, buat catatan baru dengan versi, hash, dan keputusan persetujuan baru; jangan memperbarui hash diam-diam.
