# Panduan pengembangan

Halaman ini untuk yang mau menjalankan, mengubah, atau men-deploy Tikoem. Gambaran singkatnya ada di [README](../README.md), aturan kerjanya di [`AGENTS.md`](../AGENTS.md).

## Stack

| Bagian | Pilihan |
| --- | --- |
| Frontend | Vite, React, TypeScript, Tailwind CSS (termasuk animasinya), PWA lewat vite-plugin-pwa |
| Backend dan database | Convex: query realtime, mutation, action, fungsi terjadwal, dan komponen rate limiter |
| Peta | MapLibre GL + OpenFreeMap |
| Tempat | OpenStreetMap lewat Overpass API, termasuk stasiun KRL dan halte TransJakarta kalau ada yang naik transportasi umum |
| Alamat | Nominatim (OpenStreetMap) |
| Waktu tempuh | OpenRouteService Matrix untuk motor, mobil, dan jalan kaki. Transitous (MOTIS) untuk transportasi umum |
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
| `npm run cek:layar` | Memotret layar-layar penting di 320/390 px, terang dan gelap, ke `test-results/cek-layar/`. Dipakai untuk [cek UI/UX sebelum push](desain/cek-ux.md) |
| `npm run ikon` | Membuat ulang ikon PWA dan `public/og.png`. Jalankan setelah identitas visual berubah |

## Env Convex

Diisi lewat `npx convex env set` di terminalmu sendiri, tidak pernah lewat variabel `VITE_*` atau file di repo.

| Env | Wajib | Isi |
| --- | --- | --- |
| `ORS_API_KEY` | Untuk **Cari tempat** | Key OpenRouteService, gratis di [account.heigit.org](https://account.heigit.org/signup). Tanpa key ini, hitung berakhir dengan `LAYANAN_GAGAL` |
| `OVERPASS_URL` | Tidak | Server Overpass pengganti. Kosong berarti server asli, dengan dua server cadangan |
| `ORS_URL` | Tidak | Server OpenRouteService pengganti, tanpa antrean batas laju |
| `NOMINATIM_URL` | Tidak | Server Nominatim pengganti, tanpa antrean batas laju |
| `TRANSITOUS_URL` | Tidak | Server Transitous pengganti, tanpa antrean batas laju dan tanpa jeda setelah 429 |

## Layanan luar dan batasnya

Semua layanan luar dipanggil dari Convex action, jadi key dan batasnya dijaga di server. Batasnya diatur di [`convex/batasLaju.ts`](../convex/batasLaju.ts).

| Layanan | Untuk | Batas di Tikoem |
| --- | --- | --- |
| Overpass API | Kandidat tempat | Tiga server ditanya berurutan. Server berikutnya ikut ditanya kalau yang sebelumnya gagal atau belum menjawab dalam 4 detik |
| OpenRouteService Matrix | Waktu tempuh | 30 per menit plus cadangan 10, jadi tidak pernah lebih dari 40 dalam 60 detik (batas paket gratis). Paling banyak 5 antre. Kuota hariannya (500) dihitung OpenRouteService sendiri |
| Nominatim (OSMF) | Ketik alamat | Satu permintaan tiap 1,1 detik untuk semua pengguna. Paling banyak 3 antre |
| Transitous (MOTIS) | Waktu tempuh dan ringkasan rute transportasi umum | Satu permintaan per orang yang naik transportasi umum, ke semua tempat sekaligus. Setelah tempat ditetapkan, satu permintaan lagi per orang untuk ringkasan rutenya, dihitung satu per satu. 20 per menit plus cadangan 10, jadi tidak pernah lebih dari 30 dalam 60 detik, sesuai izin dari tim Transitous ([#58](https://github.com/Wingman-Sprint/tikoem/issues/58)). Paling banyak 3 antre. Setelah dijawab 429, seluruh app berhenti bertanya selama 1 menit, lalu 2, 4, dan seterusnya sampai paling lama 15 menit kalau 429 terus datang, atau selama Retry-After kalau lebih lama |

Yang tidak kebagian antrean, atau hitung yang lewat 50 detik, berakhir dengan `LAYANAN_GAGAL` supaya layar bisa menawarkan "Coba lagi". Begitu juga hitung yang butuh Transitous selama jeda setelah 429. Hitung ulang hanya jalan kalau ada lokasi yang berubah sejak hasil terakhir.

**Hitungan harian.** Setiap Cari tempat yang mulai, dan setiap yang berakhir `LAYANAN_GAGAL`, dihitung per hari (tanggal Jakarta) di tabel `hitunganHarian`. Ini bahan untuk memutuskan perlu tidaknya cache Overpass ([#78](https://github.com/Wingman-Sprint/tikoem/issues/78)).
- **Jenisnya** `cari`, lalu penyebab gagalnya: `gagal_overpass`, `gagal_ors`, `gagal_transitous`, `gagal_batas_waktu`, atau `gagal_lain`.
- **Isinya hanya angka**, tanpa koordinat, room, atau data orang.
- **Cara membaca:** `npx convex run --prod hitunganHarian:ringkas '{"hari": 30}'`. Tanpa argumen, yang keluar 14 hari terakhir.

**Jam buka.** Kalau ada jam ketemuan, tempat yang `opening_hours`-nya jelas tutup di jam itu dilewati sebelum waktu tempuhnya dihitung, juga saat memutuskan radius perlu diperluas ([Discussions #74](https://github.com/Wingman-Sprint/tikoem/discussions/74), `src/domain/jamBuka.ts`).
- **Bentuk yang dibaca** adalah yang umum di Jakarta: "24/7", hari dan jam ("Mo-Su 10:00-22:00"), beberapa aturan ("Mo-Fr 08:00-22:00; Sa 10:00-22:00; Su closed"), beberapa rentang dalam sehari, dan jam yang lewat tengah malam ("10:00-01:00"). Dari 544 nilai di Jakarta Selatan dan Pusat (Oktober 2026), 541 dikenali.
- **Tetap ikut** tempat tanpa data jam buka (sebagian besar tempat), bentuk yang tidak dikenali ("sunrise-sunset"), dan tempat yang aturan hari liburnya (`PH`) bisa membuatnya buka, karena Tikoem tidak tahu tanggal itu hari libur atau bukan.

Catatan transportasi umum:

- **Syarat Transitous.** API-nya boleh dipakai selama Tikoem 100% open source, dari frontend sampai backend, dan orang lain bisa menjalankan ulang seluruh setup-nya. Ini jawaban tim Transitous di channel Matrix mereka ([#58](https://github.com/Wingman-Sprint/tikoem/issues/58)). Popup traktir Sociabuzz tidak masalah. Sebelum menambah SDK atau layanan yang kodenya tertutup, cek dulu syarat ini.
- **Stasiun dan halte jadi kandidat** hanya kalau ada yang naik transportasi umum ([Discussions #63](https://github.com/Wingman-Sprint/tikoem/discussions/63)). Yang dicari stasiun KRL (`network` berawalan KAI) dan halte TransJakarta (`amenity=bus_station` dengan `network` Transjakarta). Stasiun MRT dan LRT belum ikut karena belum dihitung Transitous. Paling banyak empat yang dihitung waktu tempuhnya, dan paling banyak dua yang masuk lima besar. Kategorinya `stasiun`, dan namanya diberi awalan "Stasiun" atau "Halte". Arah peron di nama halte dibuang ("Pancoran Arah Barat" jadi "Halte Pancoran"), jadi satu halte cukup satu kandidat.
- **Jam berangkat** transportasi umum adalah jam ketemuan kalau diisi ([Discussions #83](https://github.com/Wingman-Sprint/tikoem/discussions/83)), atau saat Cari tempat ditekan. Pada Sabtu dan Minggu (waktu Jakarta), yang ditanyakan Senin berikutnya di jam yang sama, karena feed KRL di Transitous hanya berisi jadwal hari kerja (`src/domain/transportasiUmum.ts`). Waktunya sudah termasuk menunggu kendaraan dan jalan kaki ke dan dari halte.
- **Jalan kaki ke halte** paling lama 15 menit, bawaan MOTIS. Orang yang lebih jauh dari halte TransJakarta dan stasiun KRL mendapat `TRANSPORTASI_UMUM_TIDAK_TERJANGKAU`.
- **Ringkasan rute** ([Discussions #83](https://github.com/Wingman-Sprint/tikoem/discussions/83)):
  - **Kapan dihitung.** Setelah tempat ditetapkan, untuk setiap orang yang naik transportasi umum dan sudah berbagi lokasi, lewat `/api/v6/plan` (`convex/ringkasanRute.ts`).
  - **Jam acuannya.** Dengan jam ketemuan, yang ditanyakan rute yang sampai paling lambat jam itu (`arriveBy`). Tanpa jam ketemuan, rute yang berangkat saat itu.
  - **Satu pilihan.** Dengan jam ketemuan, yang berangkat paling akhir. Tanpa jam ketemuan, yang paling cepat sampai. Pindah kendaraan lebih sedikit menang kalau selisihnya paling banyak 5 menit.
  - **Nama.** Stasiun KRL di feed huruf besar semua, jadi dirapikan, lalu diberi awalan seperti kandidat. Arah dan nomor peron di nama halte dibuang (`src/domain/ringkasanRute.ts`).
  - **Akhir pekan.** Dihitung dengan jadwal Senin seperti waktu tempuh, lalu jamnya dikembalikan ke hari aslinya.
  - **Hitung ulang.** Untuk semua orang saat jam ketemuan berubah, dan untuk orang itu saja saat dia mengubah lokasi atau kendaraan selama tempat tetap.
  - **Privasi.** Ringkasan tidak memuat koordinat atau garis rute. Datanya dihapus saat tempat dibuka lagi, saat orangnya keluar, dan saat room berakhir.
  - **Kalau gagal.** Ringkasan yang gagal, termasuk selama jeda setelah 429, atau yang belum selesai setelah 3 menit, jadi `gagal`. Status room tidak ikut berubah.
- **Endpoint-nya masih eksperimen** (`/api/experimental/one-to-many-intermodal`). Kata tim Transitous, API tanpa versi bisa berubah tanpa pemberitahuan. `/api/v6/plan` untuk ringkasan rute juga bisa diganti versi baru. Kalau bentuk jawabannya berubah, log Convex menulis "Bentuk jawaban Transitous tidak dikenali": room berakhir `LAYANAN_GAGAL`, dan ringkasan rute jadi `gagal`. Cek [openapi MOTIS](https://transitous.org/api/) versi terbaru. Server mana yang sedang jalan terlihat dari header `Server` jawabannya. Cadangannya goRute ([#58](https://github.com/Wingman-Sprint/tikoem/issues/58)).

## E2E

Pertama kali di mesin baru: `npx playwright install --only-shell chromium`.

E2E memakai backend Convex lokal di `127.0.0.1:3210`. Kalau `npx convex dev` sudah jalan, backend itu yang dipakai. Kalau belum, E2E menyalakannya sendiri. Di CI, backend-nya dibuat baru tanpa akun setiap kali jalan.

Overpass, OpenRouteService, Nominatim, dan Transitous tidak dipanggil sungguhan. Di CI, keempatnya diganti server tiruan (`e2e/layanan-tiruan.ts`). Di laptop, E2E yang butuh layanan itu dilewati, kecuali dijalankan dengan `E2E_LAYANAN_TIRUAN=1 npm run test:e2e`. Selama itu, env `OVERPASS_URL`, `ORS_URL`, `NOMINATIM_URL`, dan `TRANSITOUS_URL` di deployment lokalmu diarahkan ke server tiruan, lalu dikembalikan. Untuk menguji keadaan gagal, taruh peserta di `LOKASI_TANPA_TEMPAT` atau `LOKASI_LAYANAN_GAGAL` dari `e2e/backend.ts`. Untuk `LOKASI_TIDAK_TERJANGKAU`, taruh satu peserta di `LOKASI_TIDAK_TERJANGKAU` (Teluk Jakarta) dan yang lain di darat. Untuk `TRANSPORTASI_UMUM_TIDAK_TERJANGKAU`, taruh orang yang naik transportasi umum di `LOKASI_TANPA_TRANSPORTASI_UMUM` (Cileungsi). Kalau ada yang naik transportasi umum, Overpass tiruan juga memberi "Stasiun Tiruan", "Stasiun Tiruan Baru", dan "Halte Tiruan" di dekat titik tengah, jadi penanda stasiun bisa diuji.

Transitous tiruan juga menjawab `/api/v6/plan` untuk ringkasan rute:
- **Biasanya** isinya jalan 5 menit ke Stasiun Tiruan, KRL "Commuter Line Tiruan" 12 menit lewat dua stasiun, lalu jalan 4 menit. Dengan jam ketemuan, rutenya sampai tepat di jam itu.
- **`LOKASI_TANPA_TRANSPORTASI_UMUM`** (Cileungsi) membuat ringkasannya `tidak_ada`.
- **`LOKASI_RUTE_GAGAL_SEKALI`** (Lebak Bulus) membuat ringkasan pertama `gagal`, lalu berhasil setelah `room.hitungRute`. Cari tempat dari titik ini tetap berjalan biasa.

Di sekitar `LOKASI_TEMPAT_TUTUP_MALAM` (Bogor), semua tempat dari Overpass tiruan hanya buka pukul 08.00–17.00. Dengan jam ketemuan malam hari, hitung berakhir `TEMPAT_TIDAK_DITEMUKAN` (`e2e/jam-buka.spec.ts`).

Contohnya ada di `e2e/ringkasan-rute.spec.ts`.

Pilihan "Transportasi umum" belum muncul di layar sampai layarnya siap (`KENDARAAN` di `src/domain/kendaraan.ts`). Untuk E2E layar, buat orang yang naik transportasi umum lewat `room.gabung` atau `room.ubahKendaraan` dari test, seperti di `e2e/layanan.spec.ts`.

## Kontrak data

Frontend hanya bicara dengan backend lewat fungsi Convex ini. Perubahan bentuknya dibahas dulu di issue atau Discussions ([`AGENTS.md`](../AGENTS.md#3-pembagian-peran)). Kesepakatan awalnya ada di [Discussions #8](https://github.com/Wingman-Sprint/tikoem/discussions/8).

| Fungsi | Jenis | Isi |
| --- | --- | --- |
| `room.buat({ nama, kendaraan })` | mutation | Room baru dengan kode 6 karakter, pembuatnya jadi peserta pertama. `kendaraan`: `motor`, `mobil`, `jalan_kaki`, atau `transportasi_umum` ([Discussions #63](https://github.com/Wingman-Sprint/tikoem/discussions/63)). Mengembalikan `{ kode, pesertaId, kunci, urutanGabung }` |
| `room.gabung({ kode, nama, kendaraan })` | mutation | Gabung ke room. Mengembalikan `{ pesertaId, kunci, urutanGabung }` |
| `room.kirimLokasi({ pesertaId, kunci, lokasi })` | mutation | Simpan lokasi yang sudah dibulatkan. Hasil yang sudah keluar ditandai usang |
| `room.ubahKendaraan({ pesertaId, kunci, kendaraan })` | mutation | Ganti kendaraan tanpa keluar room. Kalau orang itu sudah berbagi lokasi, hasil yang sudah keluar ditandai usang |
| `room.ubahJamKetemuan({ pesertaId, kunci, jamKetemuan })` | mutation | Isi jam ketemuan dalam milidetik, atau `null` untuk mengosongkannya. Siapa saja di room boleh, juga setelah tempat ditetapkan. Detiknya dibuang, dan jam yang sudah lewat atau lebih dari 7 hari lagi ditolak dengan `JAM_KETEMUAN_TIDAK_VALID`. Jam ini jadi jam berangkat transportasi umum, dan hasil yang sudah keluar ditandai usang ([Discussions #83](https://github.com/Wingman-Sprint/tikoem/discussions/83)) |
| `room.hitung({ pesertaId, kunci })` | mutation | Mulai mencari tempat di latar. Tidak melakukan apa-apa kalau hasilnya masih berlaku |
| `room.vote({ pesertaId, kunci, kandidatId })` | mutation | Pilih tempat. `kandidatId: null` membatalkan pilihan |
| `room.tetapkan({ pesertaId, kunci, kandidatId })` | mutation | Tetapkan tempat untuk semua orang. Siapa saja di room boleh, tapi hanya untuk suara terbanyak saat ini ([Discussions #42](https://github.com/Wingman-Sprint/tikoem/discussions/42)) |
| `room.bukaLagi({ pesertaId, kunci })` | mutation | Buka voting lagi. Vote yang sudah ada tetap disimpan, dan ringkasan rute dihapus |
| `room.hitungRute({ pesertaId, kunci })` | mutation | Tombol Coba lagi untuk ringkasan rute sendiri yang `gagal`. Selain itu tidak terjadi apa-apa ([Discussions #83](https://github.com/Wingman-Sprint/tikoem/discussions/83)) |
| `room.keluar({ pesertaId, kunci })` | mutation | Hapus nama, lokasi, dan pilihan orang itu dari room |
| `room.lihat({ kode })` | query | Room (termasuk `tetap`: `{ kandidatId, olehPesertaId, pada }` atau `null`, `jamKetemuan`: `{ waktu, olehPesertaId }` atau `null`, `putaranHitung` yang naik setiap tombol Cari tempat ditekan, dan `pesertaTidakTerjangkau`), peserta (termasuk `rute`, lihat di bawah), dan kandidat secara realtime, atau `{ ok: false, galat }` |
| `lokasi.cari({ teks })` | action | Cari alamat lewat Nominatim |
| `lokasi.alamat({ lokasi })` | action | Label untuk titik yang dipilih di peta lewat Nominatim reverse: `{ label }`, atau `null` kalau titiknya tidak dekat jalan, misalnya di laut ([#53](https://github.com/Wingman-Sprint/tikoem/issues/53)). Antreannya sama dengan `lokasi.cari`, jadi panggil setelah peta berhenti digeser. Galatnya `LAYANAN_GAGAL` atau `LOKASI_TIDAK_VALID` |

`pesertaId` dan `kunci` adalah identitas "ini aku" di sebuah room, disimpan di `localStorage` HP itu saja. Galat dikirim sebagai kode di `error.data.galat` (mutation dan action) atau `galat` (query). Daftarnya ada di tipe `Galat` di [`convex/room.ts`](../convex/room.ts), ditambah `galatHitung`: `TEMPAT_TIDAK_DITEMUKAN`, `LAYANAN_GAGAL`, `LOKASI_TIDAK_TERJANGKAU`, atau `TRANSPORTASI_UMUM_TIDAK_TERJANGKAU`. `LOKASI_TIDAK_TERJANGKAU` berarti lokasi satu orang terlalu jauh dari jalan, misalnya pin di laut, dan `room.pesertaTidakTerjangkau` berisi id orang itu, atau `null` lagi setelah dia memperbarui lokasinya atau keluar ([#53](https://github.com/Wingman-Sprint/tikoem/issues/53)). `TRANSPORTASI_UMUM_TIDAK_TERJANGKAU` berarti orang yang naik transportasi umum tidak punya rute ke tempat mana pun, misalnya jauh dari halte dan stasiun. `room.pesertaTidakTerjangkau` juga berisi id orang itu, dan jadi `null` lagi setelah dia memperbarui lokasinya, mengganti kendaraan, atau keluar ([Discussions #63](https://github.com/Wingman-Sprint/tikoem/discussions/63)). Selama tempat sudah ditetapkan, `vote`, `hitung`, dan menetapkan tempat lain ditolak dengan `ROOM_SUDAH_TETAP`. `tetapkan` untuk tempat yang sudah bukan suara terbanyak ditolak dengan `PILIHAN_BERUBAH`.

`peserta[].rute` adalah ringkasan rute ke tempat yang ditetapkan ([Discussions #83](https://github.com/Wingman-Sprint/tikoem/discussions/83)). Nilainya `null` untuk orang yang tidak naik transportasi umum, belum berbagi lokasi, atau selama tempat belum ditetapkan. Bentuk lengkapnya `vRingkasanRute` di [`convex/schema.ts`](../convex/schema.ts):

- `{ status: 'menghitung' }` atau `{ status: 'gagal' }`. Kalau gagal, orangnya bisa memanggil `room.hitungRute`.
- `{ status: 'tidak_ada', jamKetemuan }`: Transitous tidak menemukan rute di jam itu, misalnya lewat tengah malam.
- `{ status: 'siap', jamKetemuan, dihitungPada, berangkat, sampai, langkah }`. `jamKetemuan: null` berarti dihitung untuk berangkat pada `dihitungPada`. Tiap `langkah` berupa:
  - `{ jenis: 'jalan', mulai, menit, ke }`, dengan `ke: null` untuk jalan ke tempat yang ditetapkan;
  - atau `{ jenis: 'kereta' | 'bus', layanan, jalur, arah, naik, turun, mulai, menit, perhentian, warna }`.

  Semua waktu dalam milidetik.

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

- **Diagram arsitektur** dibuat dengan [Archify](https://github.com/tt-a1i/archify) dari [`arsitektur.archify.json`](arsitektur.archify.json). Versi interaktifnya (`docs/arsitektur.html`) dipublikasikan lewat GitHub Pages di https://wingman-sprint.github.io/tikoem/arsitektur.html, dan tiap node menaut ke baris kode di commit yang tertulis di `meta.repository.revision`. Setelah arsitektur berubah:
  1. Perbarui JSON-nya, termasuk revisi dan nomor baris rujukan.
  2. Jalankan `archify finalize architecture docs/arsitektur.archify.json .archify/arsitektur.html --repo-root . --quality showcase`.
  3. Salin `.archify/arsitektur.html` ke `docs/arsitektur.html`.
  4. Ekspor PNG terang dan gelap dari tombol Export ke `docs/gambar/arsitektur-terang.png` dan `arsitektur-gelap.png`.
- **Gambar promo** (`docs/gambar/promo-*.png`, 1320×2868 seperti screenshot App Store) memakai layar production asli dengan bingkai iPhone 17 dari Simulator Xcode. Setelah tampilan layarnya berubah:
  1. Potret layar production dengan room uji, lalu beri bingkai iPhone 17 berlatar transparan (1362×2724). Namai `bingkai-1-buat-room.png`, `bingkai-2-peta.png`, `bingkai-3-adil.png`, dan `bingkai-4-hasil.png`, lalu keluarkan semua peserta uji lewat `room.keluar`.
  2. Jalankan `npm run promo -- <folder tangkapan>`. Judul, subjudul, warna kartu, dan pin hiasan tiap panel ada di [`scripts/buat-promo.mjs`](../scripts/buat-promo.mjs).
  3. Perbarui alt text gambarnya di README kalau isi layarnya berubah.

## Kalau ada masalah

| Gejala | Penyebab yang biasa |
| --- | --- |
| **Cari tempat** selalu berakhir "layanan gagal" | `ORS_API_KEY` belum diisi, kuota harian OpenRouteService habis, atau Overpass sedang sibuk. Cek log di terminal `npx convex dev`, atau di dashboard Convex untuk production |
| Hitung lewat `npx convex run` tidak pernah selesai | Tanpa `npx convex dev` yang menyala, `npx convex run` hanya menyalakan backend lokal selama satu panggilan, jadi fungsi terjadwal ikut berhenti |
| E2E di laptop banyak yang dilewati | Jalankan dengan `E2E_LAYANAN_TIRUAN=1` |
| Typecheck gagal setelah mengubah `convex/` | `convex/_generated/` belum dibuat ulang. Jalankan `npx convex dev` sekali |
