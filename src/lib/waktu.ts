const MENIT = 60_000
const JAM = 60 * MENIT

/** Sisa waktu yang mudah dibaca, misalnya "23 jam lagi" atau "15 menit lagi". Dibulatkan ke bawah supaya tidak terlalu optimis. */
export function sisaWaktu(sisaMs: number): string {
  if (sisaMs <= 0) return 'sudah berakhir'
  if (sisaMs < MENIT) return 'kurang dari 1 menit lagi'
  if (sisaMs < JAM) return `${Math.floor(sisaMs / MENIT)} menit lagi`
  return `${Math.floor(sisaMs / JAM)} jam lagi`
}
