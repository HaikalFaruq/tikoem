/** Huruf dan angka yang tidak gampang tertukar saat dibaca atau diketik: tanpa 0/O dan 1/I/L. */
export const ALFABET_KODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const PANJANG_KODE = 6

/** Room beserta semua lokasi di dalamnya hanya hidup 24 jam (AGENTS.md §8). */
export const MASA_ROOM_MS = 24 * 60 * 60 * 1000

/** Warna dan aksesori pin cukup untuk 24 orang (docs/desain/identitas.html). */
export const MAKS_PESERTA = 24

/** `acak` mengembalikan angka 0 sampai di bawah 1, seperti `Math.random`. */
export function buatKodeRoom(acak: () => number): string {
  let kode = ''
  for (let i = 0; i < PANJANG_KODE; i++) kode += ALFABET_KODE[Math.floor(acak() * ALFABET_KODE.length)]
  return kode
}

/** Kode dari link atau ketikan. Huruf kecil dan spasi di pinggir diterima, format lain menghasilkan `null`. */
export function normalisasiKode(masukan: string): string | null {
  const kode = masukan.trim().toUpperCase()
  if (kode.length !== PANJANG_KODE) return null
  for (const huruf of kode) if (!ALFABET_KODE.includes(huruf)) return null
  return kode
}

export const sudahKedaluwarsa = (kedaluwarsaPada: number, sekarang: number) => sekarang >= kedaluwarsaPada

/** Dihitung dari urutan gabung, bukan dari peserta yang masih ada, supaya nomor pin tidak pernah lewat dari 24. */
export const roomPenuh = (jumlahGabung: number) => jumlahGabung >= MAKS_PESERTA
