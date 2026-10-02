export const MAKS_PANJANG_NAMA = 24

/** Spasi berlebih dibuang. Hasilnya `null` kalau nama kosong atau lebih dari 24 karakter. */
export function rapikanNama(masukan: string): string | null {
  const nama = masukan.trim().replace(/\s+/g, ' ')
  const panjang = Array.from(nama).length
  if (panjang === 0 || panjang > MAKS_PANJANG_NAMA) return null
  return nama
}
