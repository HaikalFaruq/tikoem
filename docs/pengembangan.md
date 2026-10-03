# Panduan pengembangan

Halaman ini untuk yang mau menjalankan, mengubah, atau men-deploy Tikoem. Gambaran singkatnya ada di [README](../README.md), aturan kerjanya di [`AGENTS.md`](../AGENTS.md).

## Stack

| Bagian | Pilihan |
| --- | --- |
| Frontend | Vite, React, TypeScript, Tailwind CSS (termasuk animasinya), PWA lewat vite-plugin-pwa |
| Backend dan database | Convex: query realtime, mutation, action, fungsi terjadwal, dan komponen rate limiter |
| Peta | MapLibre GL + OpenFreeMap |
| Tempat | OpenStreetMap lewat Overpass API |
| Alamat | Nominatim (OpenStreetMap) |
| Waktu tempuh | OpenRouteService Matrix |
| Kualitas | Vitest, Playwright, oxlint, knip, GitHub Actions |
| Deploy | Vercel + Convex Cloud |

Struktur folder dan aturan import antar layer ada di [`AGENTS.md`](../AGENTS.md#6-stack-dan-arsitektur), dan ikut dicek oleh lint.

## Menjalankan lokal

Butuh Node.js 22 atau lebih baru.

```bash
npm install
npx convex dev   # pertama kali: pilih "Start without an account (run Convex locally)"
npm run dev      # di terminal kedua
```

Biarkan `npx convex dev` tetap jalan. Selain menyinkronkan `convex/` dan membuat ulang `convex/_generated/`, perintah ini juga menjalankan fungsi terjadwal seperti pencarian tempat dan penghapusan room. `convex/_generated/` ikut di-commit, jadi commit perubahannya bersama perubahan di `convex/`.

| Perintah | Fungsi |
| --- | --- |
| `npm run build` / `npm run preview` | Build production + PWA ke `dist/`, lalu sajikan secara lokal |
| `npm run typecheck` | Cek tipe untuk `src/`, `convex/`, dan `e2e/` |
| `npm run lint` | oxlint, termasuk aturan import antar layer. Warning dianggap gagal |
| `npm run knip` | Menolak file, export, dan dependensi yang tidak terpakai |
| `npm test` | Unit test (Vitest). `npm run test:watch` untuk mode pantau |
| `npm run test:e2e` | E2E di browser HP (Playwright), lihat [E2E](#e2e) |
| `npm run ikon` | Membuat ulang ikon PWA dan `public/og.png`. Jalankan setelah identitas visual berubah |

## Env Convex

Diisi lewat `npx convex env set` di terminalmu sendiri, tidak pernah lewat variabel `VITE_*` atau file di repo.

| Env | Wajib | Isi |
| --- | --- | --- |
| `ORS_API_KEY` | Untuk **Cari tempat** | Key OpenRouteService, gratis di [account.heigit.org](https://account.heigit.org/signup). Tanpa key ini, hitung berakhir dengan `LAYANAN_GAGAL` |
| `OVERPASS_URL` | Tidak | Server Overpass pengganti. Kosong berarti server asli, dengan dua server cadangan |
| `ORS_URL` | Tidak | Server OpenRouteService pengganti, tanpa antrean batas laju |
| `NOMINATIM_URL` | Tidak | Server Nominatim pengganti, tanpa antrean batas laju |

## Layanan luar dan batasnya

Semua layanan luar dipanggil dari Convex action, jadi key dan batasnya dijaga di server. Batasnya diatur di [`convex/batasLaju.ts`](../convex/batasLaju.ts).

| Layanan | Untuk | Batas di Tikoem |
| --- | --- | --- |
| Overpass API | Kandidat tempat | Tiga server ditanya berurutan. Server berikutnya ikut ditanya kalau yang sebelumnya gagal atau belum menjawab dalam 4 detik |
| OpenRouteService Matrix | Waktu tempuh | 30 per menit plus cadangan 10, jadi tidak pernah lebih dari 40 dalam 60 detik (batas paket gratis). Paling banyak 5 antre. Kuota hariannya (500) dihitung OpenRouteService sendiri |
| Nominatim (OSMF) | Ketik alamat | Satu permintaan tiap 1,1 detik untuk semua pengguna. Paling banyak 3 antre |

Yang tidak kebagian antrean, atau hitung yang lewat 50 detik, berakhir dengan `LAYANAN_GAGAL` supaya layar bisa menawarkan "Coba lagi". Hitung ulang hanya jalan kalau ada lokasi yang berubah sejak hasil terakhir.

## E2E

Pertama kali di mesin baru: `npx playwright install --only-shell chromium`.

E2E memakai backend Convex lokal di `127.0.0.1:3210`. Kalau `npx convex dev` sudah jalan, backend itu yang dipakai. Kalau belum, E2E menyalakannya sendiri. Di CI, backend-nya dibuat baru tanpa akun setiap kali jalan.

Overpass, OpenRouteService, dan Nominatim tidak dipanggil sungguhan. Di CI, ketiganya diganti server tiruan (`e2e/layanan-tiruan.ts`). Di laptop, E2E yang butuh layanan itu dilewati, kecuali dijalankan dengan `E2E_LAYANAN_TIRUAN=1 npm run test:e2e`. Selama itu, env `OVERPASS_URL`, `ORS_URL`, dan `NOMINATIM_URL` di deployment lokalmu diarahkan ke server tiruan, lalu dikembalikan. Untuk menguji keadaan gagal, taruh peserta di `LOKASI_TANPA_TEMPAT` atau `LOKASI_LAYANAN_GAGAL` dari `e2e/backend.ts`.

## Kontrak data

Frontend hanya bicara dengan backend lewat fungsi Convex ini. Perubahan bentuknya dibahas dulu di issue atau Discussions ([`AGENTS.md`](../AGENTS.md#3-pembagian-peran)). Kesepakatan awalnya ada di [Discussions #8](https://github.com/HaikalFaruq/tikoem/discussions/8).

| Fungsi | Jenis | Isi |
| --- | --- | --- |
| `room.buat({ nama, kendaraan })` | mutation | Room baru dengan kode 6 karakter, pembuatnya jadi peserta pertama. Mengembalikan `{ kode, pesertaId, kunci, urutanGabung }` |
| `room.gabung({ kode, nama, kendaraan })` | mutation | Gabung ke room. Mengembalikan `{ pesertaId, kunci, urutanGabung }` |
| `room.kirimLokasi({ pesertaId, kunci, lokasi })` | mutation | Simpan lokasi yang sudah dibulatkan. Hasil yang sudah keluar ditandai usang |
| `room.hitung({ pesertaId, kunci })` | mutation | Mulai mencari tempat di latar. Tidak melakukan apa-apa kalau hasilnya masih berlaku |
| `room.vote({ pesertaId, kunci, kandidatId })` | mutation | Pilih tempat. `kandidatId: null` membatalkan pilihan |
| `room.keluar({ pesertaId, kunci })` | mutation | Hapus nama, lokasi, dan pilihan orang itu dari room |
| `room.lihat({ kode })` | query | Room, peserta, dan kandidat secara realtime, atau `{ ok: false, galat }` |
| `lokasi.cari({ teks })` | action | Cari alamat lewat Nominatim |

`pesertaId` dan `kunci` adalah identitas "ini aku" di sebuah room, disimpan di `localStorage` HP itu saja. Galat dikirim sebagai kode di `error.data.galat` (mutation dan action) atau `galat` (query). Daftarnya ada di tipe `Galat` di [`convex/room.ts`](../convex/room.ts), ditambah `galatHitung`: `TEMPAT_TIDAK_DITEMUKAN` atau `LAYANAN_GAGAL`.

## Gerbang mutu

CI menjalankan `typecheck`, `lint`, `knip`, `test`, dan `test:e2e` di setiap PR dan setiap push ke `main`. Perilaku baru wajib disertai test: logika di unit test, alur pengguna di E2E. Tampilan dicek di lebar 320 px dan 390 px, mode terang dan gelap.

## Deploy

Frontend di Vercel dan backend di Convex production, dua-duanya dibangun dari `main` lewat `vercel.json`:

- **Build:** `npx convex deploy` dulu, lalu `npm run build` dengan `VITE_CONVEX_URL` milik production.
- **Link room:** `/r/ABC234` diarahkan ke app, jadi link dari WhatsApp tidak 404.
- **Service worker:** `sw.js` tidak di-cache, jadi versi baru PWA cepat sampai.
- **Hanya `main`:** branch lain dilewati. Pengecekannya memakai `VERCEL_GIT_COMMIT_REF`, bukan `VERCEL_ENV` (lihat #34).

Setiap push ke `main` mendapat status commit `Vercel`. "Deployment has completed" berarti frontend dan backend production sudah memakai kode terbaru.

Penyiapan sekali saja:

1. Di dashboard Convex, buat **Production Deploy Key** untuk project `tikoem`.
2. Import repo ini di Vercel, lalu tambahkan env `CONVEX_DEPLOY_KEY` berisi key tadi, untuk Production saja.
3. Isi key OpenRouteService production dari terminalmu sendiri: `npx convex env set ORS_API_KEY <key-mu> --prod`.

## Gambar di README

- **Diagram arsitektur** dibuat dengan [Archify](https://github.com/tt-a1i/archify) dari [`arsitektur.archify.json`](arsitektur.archify.json). Tiap node merujuk ke baris kode di commit yang tertulis di `meta.repository.revision`. Setelah arsitektur berubah, perbarui JSON-nya, jalankan `archify finalize architecture docs/arsitektur.archify.json .archify/arsitektur.html --repo-root . --quality showcase`, lalu ekspor PNG terang dan gelap dari tombol Export ke `docs/gambar/arsitektur-terang.png` dan `arsitektur-gelap.png`.
- **Gambar promo** (`docs/gambar/promo-*.png`, 1320×2868 seperti screenshot App Store) memakai layar production asli dengan bingkai iPhone 17 dari Simulator Xcode. Ganti kalau tampilan layarnya berubah.

## Kalau ada masalah

| Gejala | Penyebab yang biasa |
| --- | --- |
| **Cari tempat** selalu berakhir "layanan gagal" | `ORS_API_KEY` belum diisi, kuota harian OpenRouteService habis, atau Overpass sedang sibuk. Cek log di terminal `npx convex dev`, atau di dashboard Convex untuk production |
| Hitung lewat `npx convex run` tidak pernah selesai | Tanpa `npx convex dev` yang menyala, `npx convex run` hanya menyalakan backend lokal selama satu panggilan, jadi fungsi terjadwal ikut berhenti |
| E2E di laptop banyak yang dilewati | Jalankan dengan `E2E_LAYANAN_TIRUAN=1` |
| Typecheck gagal setelah mengubah `convex/` | `convex/_generated/` belum dibuat ulang. Jalankan `npx convex dev` sekali |
