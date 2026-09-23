# Rencana: Label Profile dan Komposisi Barcode/QR oleh PPIC

> Status: **PROPOSED**. Ini adalah discovery kebutuhan dan rancangan target;
> belum merupakan konfigurasi produksi, perubahan SAP, maupun implementasi
> runtime.

## 1. Keputusan kebutuhan

SAP mengirim **raw business snapshot** yang tersedia untuk setiap item label:
semua characteristic yang diizinkan, serta fakta non-characteristic seperti
material, batch, SO/SO item, atau customer text bila tersedia.

Thermal Label Studio memilih `label_code` / label profile, template, dan
aturan presentasi. PPIC dapat mengonfigurasi isi barcode atau QR dari field
raw yang tersedia, tanpa meminta perubahan ABAP hanya untuk mengganti susunan
atau teks tampilan.

Ketiadaan suatu field tetap bermakna: absent, `null`, dan string kosong tidak
boleh diam-diam diganti dengan nilai lain.

## 2. Yang nanti dapat dikonfigurasi PPIC

Untuk setiap elemen barcode/QR di suatu versi template, profile harus dapat
menyimpan konfigurasi versioned berikut:

- jenis output: barcode 1D atau QR;
- symbology yang didukung oleh engine;
- daftar segmen, dalam urutan yang ditentukan PPIC;
- segmen literal, misalnya `Batch : `, `|`, baris baru, atau satuan `Meter`;
- segmen field raw yang dipilih dari characteristic atau `business_context`;
- aturan format terbatas, misalnya label teks, separator, pembulatan angka,
  satuan, tanggal, padding, huruf besar/kecil, dan newline;
- perilaku field absent, `null`, atau kosong: tampil kosong, tampil penanda,
  beri warning, atau blokir render;
- batas panjang payload dan validasi symbology; serta
- status approval PPIC dan versi konfigurasi.

Contoh konsep konfigurasi human-readable:

```text
literal: "Batch : "
field:   business_context.batch_number
literal: "\nPanjang : "
field:   characteristics.ZZLENGTH
literal: " Meter"
```

Untuk nilai raw `batch_number = 0000317326` dan `ZZLENGTH = 1000`, payload
yang dirender menjadi:

```text
Batch : 0000317326
Panjang : 1000 Meter
```

Contoh format machine-readable yang dapat dipilih PPIC juga dimungkinkan:

```text
BATCH=0000317326|LENGTH=1000 M
```

Contoh di atas hanya ilustrasi sintaks. Nilai batch tersebut bukan fixture
proyek, data SAP tersimpan, atau format produksi yang telah disetujui.

## 3. Batas keamanan dan arsitektur

Konfigurasi PPIC adalah data terstruktur, **bukan kode yang dieksekusi**.
Rule engine tidak boleh menerima atau menjalankan Python, JavaScript, SQL,
shell command, URL, host, credential, atau expression evaluator bebas.

Resolver hanya boleh membaca field dari raw snapshot yang tervalidasi. Setiap
profile harus dibatasi oleh schema konfigurasi, allowlist operasi format,
ukuran payload, dan validasi symbology barcode/QR. Bila field tidak tersedia
atau hasil tidak valid, perilaku harus mengikuti policy profile dan tercatat
dengan aman pada Safe Demo evidence.

Template version, profile/rule version, konfigurasi barcode/QR version, dan
raw snapshot hash harus dicatat bersama artifact/evidence. Dengan demikian,
hasil simulasi atau cetak dapat ditelusuri tanpa menyimpan barcode sebagai
fakta yang seolah-olah berasal langsung dari SAP.

## 4. Hubungan dengan fase saat ini

B2B2K menyediakan raw snapshot extensible dan profile N001 development-only.
Barcode/QR sengaja masih kosong pada N001 karena konfigurasi PPIC belum ada.
Hal itu adalah fail-closed yang benar, bukan batasan arsitektur target.

Rancangan ini melanjutkan arah yang sudah ada pada
`docs/tasks/B2B2J/LABEL_RULE_MIGRATION_MATRIX.md`: rule profile aplikasi
memiliki kepemilikan atas formatting, nilai turunan, pemetaan template, dan
komposisi barcode/QR. Dokumen ini memperjelas bahwa PPIC nantinya mengelola
konfigurasi komposisi tersebut melalui aplikasi, dengan batas validasi dan
approval yang aman.

## 5. Prasyarat sebelum implementasi production

Sebelum profile editor atau barcode/QR production diimplementasikan, perlu
disepakati bersama PPIC:

1. field raw mana yang boleh dipakai pada setiap label profile;
2. symbology, ukuran, dan aturan scanability untuk tiap printer/media;
3. aturan field kosong untuk tiap elemen label;
4. siapa yang boleh membuat, menguji, menyetujui, dan mengaktifkan versi
   profile;
5. mekanisme Safe Demo preview/PDF sebelum sebuah versi diaktifkan; dan
6. audit, rollback, serta pengaruh perubahan profile terhadap batch yang
   sudah diterima.

Sampai prasyarat tersebut disetujui, konfigurasi barcode/QR production harus
tetap fail-closed.
