<!-- markdownlint-disable MD033 MD041 -->

<div align="center">

<img src="public/pwa-512x512.png" width="112" alt="Logo Tikoem: pin berwajah dengan bintang di kotak merah" />

# Tikoem

**Titik kumpul yang adil buat semua.**

Tiap orang kirim lokasinya, Tikoem carikan tempat ketemuan yang waktu tempuhnya paling seimbang.<br />
PWA, tanpa akun.

### [Coba di tikoem.vercel.app →](https://tikoem.vercel.app)

[![Status](https://img.shields.io/badge/v2-live-D4F35B?style=flat-square&labelColor=141414)](https://tikoem.vercel.app)
[![Convex](https://img.shields.io/badge/backend-Convex-ee342f?style=flat-square&labelColor=141414)](https://www.convex.dev)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=61dafb&labelColor=141414)](https://react.dev)
[![OpenStreetMap](https://img.shields.io/badge/peta-OpenStreetMap-7ebc6f?style=flat-square&logo=openstreetmap&logoColor=white&labelColor=141414)](https://www.openstreetmap.org)

</div>

<p align="center">
  <img src="docs/gambar/promo-1-buat-room.png" width="24%" alt="Ketemuan yang adil buat semua: layar buat room dengan pilihan motor, mobil, jalan kaki, dan transportasi umum" />
  <img src="docs/gambar/promo-2-peta.png" width="24%" alt="Semua teman kelihatan di peta: pin tiap orang, bintang tempat kumpul, dan penanda kereta untuk stasiun" />
  <img src="docs/gambar/promo-3-adil.png" width="24%" alt="Adil itu soal waktu, bukan jarak: Halte Matraman Baru dengan waktu tempuh 17, 17, dan 15 menit" />
  <img src="docs/gambar/promo-4-hasil.png" width="24%" alt="Tetapkan, lalu kirim ke grup: kartu Fix! Kopi Kenangan Matraman dengan tombol kirim ke grup WA" />
</p>

## Cara pakai

1. Buat room, lalu bagikan link-nya ke grup WhatsApp.
2. Tiap teman mengisi nama dan kendaraan (motor, mobil, jalan kaki, atau transportasi umum), lalu berbagi lokasi lewat GPS, ketik alamat, atau pilih titik di peta.
3. Ketuk **Cari tempat**. Tikoem menampilkan 5 tempat dengan waktu tempuh terlama paling pendek, jadi tidak ada yang jauh sendiri. Kalau ada yang naik KRL atau TransJakarta, stasiun dan halte di dekat titik tengah ikut jadi pilihan.
4. Pilih bareng, lalu kirim kartu hasilnya ke grup.

Satu room muat 24 orang. Nama, lokasi, dan pilihan dihapus otomatis 24 jam setelah room dibuat.

## Cara kerja

<sub>KODE → DIAGRAM · Peta sistem yang menaut ke baris kodenya</sub>

<a href="https://wingman-sprint.github.io/tikoem/arsitektur.html">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/gambar/arsitektur-gelap.png" />
  <img src="docs/gambar/arsitektur-terang.png" alt="Arsitektur Tikoem: PWA memanggil room.hitung di Convex, action terjadwal bertanya ke Overpass, OpenRouteService, dan Transitous, lalu hasilnya sampai ke semua HP lewat query realtime" />
</picture>
</a>

**[Buka diagram interaktif ↗](https://wingman-sprint.github.io/tikoem/arsitektur.html)** · [telusuri jalur Cari tempat ↗](https://wingman-sprint.github.io/tikoem/arsitektur.html#route=teman~ors) · [jalur transportasi umum ↗](https://wingman-sprint.github.io/tikoem/arsitektur.html#route=teman~transitous) · [sumber JSON](docs/arsitektur.archify.json)

- **Adil, bukan sekadar tengah.** Pencarian dimulai dari pusat lingkaran terkecil yang memuat lokasi semua orang. Kandidat dari Overpass diberi waktu tempuh tiap orang, lewat OpenRouteService untuk motor, mobil, dan jalan kaki, atau lewat [Transitous](https://transitous.org/sources/) untuk KRL dan TransJakarta. Yang menang adalah tempat dengan waktu tempuh terlama paling pendek.
- **Realtime.** Hitung berjalan di action Convex terjadwal, dan hasilnya langsung sampai ke semua HP di room.
- **Privat.** Lokasi dibulatkan sekitar 100 m, dihapus setelah 24 jam, dan tidak pernah ditulis ke log. Key layanan luar hanya ada di env Convex.

## Jalankan lokal

Butuh Node.js 22 atau lebih baru.

```bash
npm install
npx convex dev   # pilih "Start without an account", biarkan tetap jalan
npm run dev      # di terminal kedua
```

Untuk mencoba **Cari tempat**, isi key OpenRouteService (gratis di [account.heigit.org](https://account.heigit.org/signup)) lewat `npx convex env set ORS_API_KEY <key-mu>`.

Perintah lain, env, batas layanan luar, kontrak data, E2E, dan deploy ada di [`docs/pengembangan.md`](docs/pengembangan.md).

## Tim

<table>
  <tr>
    <td align="center"><a href="https://github.com/HaikalFaruq"><img src="https://github.com/HaikalFaruq.png?size=96" width="64" alt="Muhammad Haikal Faruq" /><br /><b>Muhammad Haikal Faruq</b></a><br /><sub>Backend, algoritma, deploy</sub></td>
    <td align="center"><a href="https://github.com/bintangfabian"><img src="https://github.com/bintangfabian.png?size=96" width="64" alt="Bintang Fabian Putra" /><br /><b>Bintang Fabian Putra</b></a><br /><sub>UI/UX, motion, ilustrasi</sub></td>
  </tr>
</table>

Alur kerjanya ada di [`AGENTS.md`](AGENTS.md). Pertanyaan dan ide dibahas di [Discussions](https://github.com/Wingman-Sprint/tikoem/discussions).

Kode Tikoem berlisensi [MIT](LICENSE).
