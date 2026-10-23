const MENIT = 60_000
const JAM = 60 * MENIT
/** Jakarta memakai WIB (UTC+7) sepanjang tahun, tanpa jam musim panas. */
const SELISIH_WIB_MS = 7 * JAM

/** Tanggal di Jakarta, misalnya "2026-10-23", untuk hitungan harian. */
export const tanggalJakarta = (waktu: number) => new Date(waktu + SELISIH_WIB_MS).toISOString().slice(0, 10)

/** Sisa waktu yang mudah dibaca, misalnya "23 jam lagi" atau "15 menit lagi". Dibulatkan ke bawah supaya tidak terlalu optimis. */
export function sisaWaktu(sisaMs: number): string {
  if (sisaMs <= 0) return 'sudah berakhir'
  if (sisaMs < MENIT) return 'kurang dari 1 menit lagi'
  if (sisaMs < JAM) return `${Math.floor(sisaMs / MENIT)} menit lagi`
  return `${Math.floor(sisaMs / JAM)} jam lagi`
}

/**
 * Berapa lama menunggu sebelum permintaan berikutnya: paling sedikit `tundaMs` sejak pemicu terakhir, dan paling sedikit
 * `jarakMinMs` sejak permintaan sebelumnya. Dipakai untuk Nominatim yang hanya boleh satu permintaan per detik.
 */
export function jedaPermintaan(sekarang: number, terakhir: number | null, jarakMinMs: number, tundaMs: number): number {
  return Math.max(tundaMs, terakhir === null ? 0 : terakhir + jarakMinMs - sekarang)
}

const JEDA_AWAL_MS = MENIT
const JEDA_MAKS_MS = 15 * MENIT

type Jeda = { sampai: number; lamaMs: number }

/**
 * Jeda setelah layanan luar menjawab 429 (terlalu banyak permintaan): mulai satu menit, lalu dua kali lipat setiap 429 datang
 * lagi tidak lama setelah jeda sebelumnya habis, paling lama 15 menit. 429 dari permintaan yang terkirim sebelum jeda tercatat
 * tidak memperpanjangnya. Kalau layanan meminta jeda lebih lama lewat Retry-After (`mintaMs`), permintaannya diikuti.
 */
export function jedaBertahap(sekarang: number, sebelumnya: Jeda | null, mintaMs = 0): Jeda {
  if (sebelumnya && sekarang < sebelumnya.sampai) {
    return { sampai: Math.max(sebelumnya.sampai, sekarang + mintaMs), lamaMs: sebelumnya.lamaMs }
  }
  const berlanjut = sebelumnya !== null && sekarang - sebelumnya.sampai < sebelumnya.lamaMs
  const lamaMs = berlanjut ? Math.min(sebelumnya.lamaMs * 2, JEDA_MAKS_MS) : JEDA_AWAL_MS
  return { sampai: sekarang + Math.max(lamaMs, mintaMs), lamaMs }
}
