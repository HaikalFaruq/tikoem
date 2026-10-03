/**
 * Pesan yang menjelaskan kenapa lokasi gagal dibaca dan apa yang bisa dilakukan. `kode` dari `GeolocationPositionError`,
 * ditambah 0 untuk browser yang tidak punya fitur lokasi sama sekali.
 */
export function pesanGalatGeolokasi(kode: number): string {
  switch (kode) {
    case 0:
      return 'Browser ini tidak bisa membaca lokasi. Buka link-nya di Chrome atau Safari.'
    case 1:
      return 'Izin lokasi ditolak. Izinkan lokasi untuk situs ini di pengaturan browser, lalu coba lagi.'
    case 2:
      return 'Lokasimu belum bisa dibaca. Nyalakan GPS atau pindah ke dekat jendela, lalu coba lagi.'
    case 3:
      return 'Mencari lokasi terlalu lama. Coba lagi.'
    default:
      return 'Lokasimu belum bisa dibaca. Coba lagi.'
  }
}
