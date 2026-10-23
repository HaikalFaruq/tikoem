const MENIT = 60_000
const HARI = 24 * 60 * MENIT

/** Room hanya hidup 24 jam, tapi hasilnya dibagikan ke grup, jadi jam ketemuannya boleh sampai seminggu lagi (Discussions #83). */
const MAKS_KE_DEPAN_MS = 7 * HARI
/** Jam HP bisa meleset dari jam server, jadi jam yang baru lewat sebentar masih diterima. */
const TOLERANSI_LEWAT_MS = 5 * MENIT

/**
 * Jam ketemuan yang disimpan, dibulatkan ke bawah ke menit. `null` kalau jamnya sudah lewat lebih dari 5 menit atau lebih
 * dari 7 hari dari `sekarang` (Discussions #83).
 */
export function rapikanJamKetemuan(waktu: number, sekarang: number): number | null {
  if (!Number.isFinite(waktu) || waktu < sekarang - TOLERANSI_LEWAT_MS || waktu > sekarang + MAKS_KE_DEPAN_MS) return null
  return Math.floor(waktu / MENIT) * MENIT
}
