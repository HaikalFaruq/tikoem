/** Tanda "ini aku" di sebuah room, tanpa akun. `kunci` hanya ada di HP ini dan tidak pernah dikirim ke orang lain. */
export type Identitas = { pesertaId: string; kunci: string }

/** Satu identitas per room, karena orang yang sama bisa ikut beberapa room. */
export const kunciPenyimpanan = (kode: string) => `tikoem:peserta:${kode}`

/** Isi localStorage bisa rusak atau diubah orang, jadi hanya bentuk yang lengkap yang diterima. */
export function uraiIdentitas(teks: string | null): Identitas | null {
  if (!teks) return null
  try {
    const data: unknown = JSON.parse(teks)
    if (typeof data !== 'object' || data === null) return null
    const { pesertaId, kunci } = data as Record<string, unknown>
    if (typeof pesertaId !== 'string' || typeof kunci !== 'string' || !pesertaId || !kunci) return null
    return { pesertaId, kunci }
  } catch {
    return null
  }
}
