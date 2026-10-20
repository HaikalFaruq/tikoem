const MENIT = 60_000
const JAM = 60 * MENIT

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
