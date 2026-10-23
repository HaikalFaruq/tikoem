/** Jakarta memakai WIB (UTC+7) sepanjang tahun, tanpa jam musim panas. */
const SELISIH_WIB_MS = 7 * 60 * 60 * 1000
const HARI_MS = 24 * 60 * 60 * 1000

/** Hari di Jakarta pada `waktu`: 0 untuk Minggu sampai 6 untuk Sabtu. */
const hariDiJakarta = (waktu: number) => new Date(waktu + SELISIH_WIB_MS).getUTCDay()

/**
 * Jam berangkat yang ditanyakan ke Transitous untuk `waktu`, yaitu jam ketemuan (Discussions #83) atau saat tombol Cari tempat
 * ditekan. Feed KRL di Transitous hanya berisi jadwal Senin–Jumat, jadi pada Sabtu dan Minggu dipakai Senin berikutnya di
 * jam yang sama. Hasilnya jadi perkiraan, dan layar memberi catatan untuk itu (Discussions #63).
 */
export function berangkatTransportasiUmum(waktu: number): number {
  const hari = hariDiJakarta(waktu)
  if (hari === 6) return waktu + 2 * HARI_MS
  if (hari === 0) return waktu + HARI_MS
  return waktu
}

/**
 * Hasil yang dihitung untuk Sabtu atau Minggu (waktu Jakarta) memakai jadwal KRL hari kerja (`berangkatTransportasiUmum`),
 * jadi layar memberi catatan bahwa waktu tempuhnya perkiraan. `waktu` adalah jam ketemuan kalau ada, atau `hasilPada`
 * (Discussions #83).
 */
export function dihitungAkhirPekan(waktu: number | null): boolean {
  if (waktu === null) return false
  const hari = hariDiJakarta(waktu)
  return hari === 0 || hari === 6
}
