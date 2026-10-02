import type { Titik } from './lokasi'

export type StatusRoom = 'menunggu_peserta' | 'menghitung' | 'siap' | 'gagal'
export type GalatHitung = 'TEMPAT_TIDAK_DITEMUKAN' | 'LAYANAN_GAGAL'
export type KategoriTempat = 'kafe' | 'resto' | 'mall' | 'stasiun'

/** Sama dengan syarat `room.hitung` di backend (Discussions #8). */
export const MIN_LOKASI_HITUNG = 2

type RoomHasil = { status: StatusRoom; galatHitung: GalatHitung | null; hasilUsang: boolean }

export type KeadaanCariTempat =
  | { jenis: 'kurang_lokasi'; berbagi: number; total: number }
  | { jenis: 'bisa_dicari'; berbagi: number; total: number }
  | { jenis: 'menghitung' }
  | { jenis: 'gagal'; galat: GalatHitung | null; bisaDicobaLagi: boolean }
  | { jenis: 'siap'; usang: boolean; bisaHitungUlang: boolean }

/** Apa yang ditampilkan bagian "Cari tempat", dari status room dan berapa orang yang sudah berbagi lokasi. */
export function keadaanCariTempat(room: RoomHasil, berbagi: number, total: number): KeadaanCariTempat {
  const cukup = berbagi >= MIN_LOKASI_HITUNG
  switch (room.status) {
    case 'menghitung':
      return { jenis: 'menghitung' }
    case 'siap':
      return { jenis: 'siap', usang: room.hasilUsang, bisaHitungUlang: cukup }
    case 'gagal':
      return { jenis: 'gagal', galat: room.galatHitung, bisaDicobaLagi: cukup }
    default:
      return cukup ? { jenis: 'bisa_dicari', berbagi, total } : { jenis: 'kurang_lokasi', berbagi, total }
  }
}

/**
 * Baris waktu tempuh di kartu tempat, urut menurut urutan gabung. Orang yang sudah keluar dilewati,
 * karena sampai dihitung ulang `waktuTempuh` masih bisa memuat id mereka (#22).
 */
export function barisWaktuTempuh<Id, P extends { id: Id; urutanGabung: number }>(
  waktuTempuh: readonly { pesertaId: Id; menit: number }[],
  peserta: readonly P[],
): { peserta: P; menit: number }[] {
  return waktuTempuh
    .flatMap(({ pesertaId, menit }) => {
      const p = peserta.find((x) => x.id === pesertaId)
      return p ? [{ peserta: p, menit }] : []
    })
    .toSorted((a, b) => a.peserta.urutanGabung - b.peserta.urutanGabung)
}

const LABEL_KATEGORI: Record<KategoriTempat, string> = { kafe: 'Kafe', resto: 'Resto', mall: 'Mal', stasiun: 'Stasiun' }
export const labelKategori = (kategori: KategoriTempat) => LABEL_KATEGORI[kategori]

/** Membuka tempat di Google Maps (atau aplikasi peta bawaan HP) untuk melihat foto, ulasan, dan rute. */
export const linkMaps = ({ lat, lng }: Titik) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
