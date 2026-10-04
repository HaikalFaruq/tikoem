# Cek UI/UX sebelum push

Untuk setiap PR yang mengubah layar: `src/features/`, `src/ui/`, `index.html`, atau CSS. Tujuannya satu: orang yang baru pertama kali membuka link Tikoem dari grup WA langsung tahu harus apa, tanpa bingung.

## Putaran cek

1. Jalankan `npm run cek:layar`. Perintah ini memotret layar-layar penting (pembuka, beranda, room menunggu, peta, hasil, gagal, dan room tidak ada) di 320 px dan 390 px, terang dan gelap. Backend lokal dan layanan tiruan dinyalakan sendiri, sama seperti E2E.
2. Buka `test-results/cek-layar/index.html`, lalu nilai tiap layar dengan daftar di bawah. Tulis temuan dengan tingkat:
   - **Harus:** membuat orang bingung, salah langkah, atau tidak bisa memakai app (termasuk aksesibilitas).
   - **Sebaiknya:** terasa kurang rapi atau lambat, tapi orang tetap bisa lanjut.
   - **Opsional:** selera dan polesan.
3. Perbaiki semua temuan **Harus**, lalu ulangi dari langkah 1 sampai tidak ada lagi.
4. Kalau bisa, uji 5 detik dengan satu orang yang belum pernah melihat layarnya: tunjukkan layar selama 5 detik, lalu tanya "kamu harus ngapain selanjutnya?". Jawaban yang salah dihitung sebagai temuan **Harus**.
5. Di PR, lampirkan tangkapan sebelum dan sesudah (390 px terang dan 320 px gelap) langsung di deskripsi PR, tanpa di-commit. Sisa temuan **Sebaiknya** yang sengaja belum dikerjakan ditulis di bagian Selanjutnya.

Kalau menambah layar atau keadaan baru, tambahkan juga di [`e2e/cek-layar.spec.ts`](../../e2e/cek-layar.spec.ts), supaya ikut dipotret di putaran berikutnya.

## Daftar cek

### 1. Langkah berikutnya jelas

- Satu aksi utama per keadaan, yaitu tombol merah. Aksi lain memakai gaya biasa.
- Aksi utama untuk keadaan sekarang terlihat tanpa menggulir di 390 px, atau ada petunjuk yang mengarah ke sana.
- Urutan dari atas ke bawah mengikuti alur: yang harus dikerjakan dulu ada di atas (pelajaran dari #41).
- Tombol nonaktif menjelaskan kenapa nonaktif dan apa yang sedang ditunggu.

### 2. Semua keadaan punya isi dan jalan keluar

- Kosong, memuat, gagal, usang, dan selesai masing-masing punya pesan dan aksi. Tidak ada layar buntu.
- Yang memuat lebih dari 1 detik menunjukkan sedang apa.
- Galat ditulis dalam bahasa orang, bukan kode, dan selalu ada "Coba lagi" atau jalan lain.

### 3. Bahasa

- Tombol memakai kata kerja ("Cari tempat", "Kirim ke grup WA"). Kalimatnya pendek dan tanpa istilah teknis.
- Istilah yang sama dipakai di semua layar.

### 4. Sentuhan dan jangkauan

- Target sentuh minimal 44×44 px, dengan jarak minimal 8 px ke target lain.
- Tidak ada aksi yang hanya muncul saat kursor di atasnya (hover).

### 5. Aksesibilitas

- Kontras teks minimal 4,5:1 (teks besar 3:1), di mode terang dan gelap.
- Fokus keyboard terlihat, urutan Tab masuk akal, dan ikon serta peta punya label.
- Informasi tidak hanya dibedakan lewat warna. Pin juga punya nama dan aksesori.
- Perubahan realtime yang penting (hasil keluar, tempat ditetapkan) diumumkan ke pembaca layar.

### 6. Ukuran layar dan tema

- Di 320 px dan 390 px tidak ada gulir ke samping, teks tidak terpotong, dan tombol tidak bertumpuk aneh.
- Mode gelap sama jelasnya dengan mode terang.

### 7. Gerak

- Animasi biasa 150–400 ms dengan `--ease-pegas`. Momen khusus (gabung, hasil keluar) boleh lebih lama, tapi diputar sekali.
- Pembuka (splash) paling lama 2 detik, bisa dilewati, dan hanya sekali per sesi.
- Dengan reduced motion, layar langsung menampilkan keadaan akhir.

### 8. Kepercayaan dan privasi

- Sebelum meminta izin lokasi, jelaskan untuk apa dan bahwa lokasinya disamarkan.
- Lokasi persis orang lain tidak pernah ditampilkan.

### 9. Identitas Tikoem

- Gaya stiker: garis tinta tebal, bayangan keras, dan pin berwajah. Kuning bintang hanya untuk tempat kumpul ([identitas.html](identitas.html)).

### 10. Terasa cepat

- Tombol langsung bereaksi saat ditekan (turun ke bayangannya). Aksi yang menunggu server menunjukkan keadaan sibuk dan tidak bisa ditekan dua kali.

## Prompt siap tempel untuk agent

```text
Baca docs/desain/cek-ux.md. Jalankan `npm run cek:layar`, lalu periksa semua gambar di
test-results/cek-layar/ (mulai dari index.html). Untuk tiap layar, nilai dengan daftar cek dan tulis
temuan dengan tingkat Harus, Sebaiknya, atau Opsional, beserta komponen yang perlu diubah. Perbaiki
semua temuan Harus, jalankan lagi `npm run cek:layar` dan `E2E_LAYANAN_TIRUAN=1 npm run test:e2e`,
lalu ulangi sampai tidak ada temuan Harus. Ringkas hasilnya di bagian "Sudah dicek" PR, dan tulis sisa
temuan Sebaiknya di bagian "Selanjutnya".
```
