# F3.18 — Menu stacking and adaptive canvas rulers

Perbaiki popup menu pada top bar agar selalu berada di atas area ruler/canvas. Atur label ruler horizontal dan vertikal secara adaptif supaya interval angka tetap terbaca pada zoom rendah dan saat canvas dipan.

Scope: `frontend/src/components/layout/TopMenuBar.tsx` dan `frontend/src/hooks/useRulers.ts`.

Acceptance criteria: popup menu tidak tertutup ruler; label major ruler memiliki jarak piksel minimum yang layak; tick dan label tetap bekerja untuk rentang negatif, pan, dan kedua orientasi.
