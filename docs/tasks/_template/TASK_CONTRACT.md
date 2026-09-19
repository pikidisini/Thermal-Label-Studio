# Task Contract — <TASK_ID>

## Identitas

- Status: `PLANNED`
- Risk level: `<0-4>`
- Branch: `<branch>`
- Planner: `<model/provider>`
- Active writer: `<model/provider atau NONE>`
- Reviewer: `<model/provider>`

## Tujuan

Jelaskan hasil bisnis atau perilaku yang harus tersedia setelah task selesai.

## Scope

### Termasuk

- <item>

### Tidak termasuk

- <item>

## Batas keamanan

- Jangan menyentuh production, credential, atau printer fisik tanpa persetujuan eksplisit.
- Jangan menimpa perubahan pengguna.
- Hanya active writer yang boleh mengubah branch ini.

## Acceptance criteria

1. <kriteria yang dapat diuji>

## Verifikasi wajib

- <perintah/test dan hasil yang diharapkan>

## Handoff

Executor mengisi `RESULT.md`, membuat safe checkpoint, lalu berhenti. Reviewer mengisi `REVIEW.md` dan tidak melakukan merge tanpa persetujuan pengguna.
