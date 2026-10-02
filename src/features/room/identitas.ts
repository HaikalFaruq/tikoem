import type { Id } from '../../../convex/_generated/dataModel'
import { kunciPenyimpanan, uraiIdentitas } from '../../lib/identitas'

export type IdentitasRoom = { pesertaId: Id<'peserta'>; kunci: string }

// localStorage bisa menolak (mode privat, penyimpanan diblokir). Tanpa identitas, layar tetap jalan sebagai tamu.

export function bacaIdentitas(kode: string): IdentitasRoom | null {
  try {
    return uraiIdentitas(localStorage.getItem(kunciPenyimpanan(kode))) as IdentitasRoom | null
  } catch {
    return null
  }
}

export function simpanIdentitas(kode: string, identitas: IdentitasRoom) {
  try {
    localStorage.setItem(kunciPenyimpanan(kode), JSON.stringify(identitas))
  } catch {
    // Tetap lanjut: room sudah dibuat, hanya penanda "ini aku" yang hilang saat halaman dimuat ulang.
  }
}
