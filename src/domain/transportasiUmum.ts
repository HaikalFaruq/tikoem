/** Jakarta memakai WIB (UTC+7) sepanjang tahun, tanpa jam musim panas. */
const SELISIH_WIB_MS = 7 * 60 * 60 * 1000
const HARI_MS = 24 * 60 * 60 * 1000

/** Hari di Jakarta pada `waktu`: 0 untuk Minggu sampai 6 untuk Sabtu. */
const hariDiJakarta = (waktu: number) => new Date(waktu + SELISIH_WIB_MS).getUTCDay()

/**
 * Jam berangkat yang ditanyakan ke Transitous untuk tombol Cari tempat yang ditekan pada `sekarang`. Feed KRL di Transitous
 * hanya berisi jadwal Senin–Jumat, jadi pada Sabtu dan Minggu dipakai Senin berikutnya di jam yang sama. Hasilnya jadi
 * perkiraan, dan layar memberi catatan untuk itu (Discussions #63).
 */
export function berangkatTransportasiUmum(sekarang: number): number {
  const hari = hariDiJakarta(sekarang)
  if (hari === 6) return sekarang + 2 * HARI_MS
  if (hari === 0) return sekarang + HARI_MS
  return sekarang
}
