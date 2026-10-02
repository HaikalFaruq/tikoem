import { normalisasiKode } from './room'

export type Rute = { nama: 'beranda' } | { nama: 'room'; kode: string }

/** Link room yang dibagikan ke grup: `/r/ABC234`. */
export const jalurRoom = (kode: string) => `/r/${kode}`

/**
 * Halaman dari alamat browser. Kode room dari link dirapikan (huruf kecil dan spasi diterima).
 * Kode yang formatnya salah tetap diteruskan apa adanya, supaya layar room yang menampilkan "room tidak ditemukan".
 */
export function bacaRute(jalur: string): Rute {
  const cocok = /^\/r\/([^/]+)\/?$/.exec(jalur)
  if (!cocok) return { nama: 'beranda' }
  const mentah = decodeURIComponent(cocok[1])
  return { nama: 'room', kode: normalisasiKode(mentah) ?? mentah }
}
