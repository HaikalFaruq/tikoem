import type { Titik } from './lokasi'

type StatusRoom = 'menunggu_peserta' | 'menghitung' | 'siap' | 'gagal'
export type GalatHitung = 'TEMPAT_TIDAK_DITEMUKAN' | 'LAYANAN_GAGAL' | 'LOKASI_TIDAK_TERJANGKAU'
export type KategoriTempat = 'kafe' | 'resto' | 'mall' | 'stasiun'

/** Sama dengan syarat `room.hitung` di backend (Discussions #8). */
const MIN_LOKASI_HITUNG = 2

type RoomHasil = { status: StatusRoom; galatHitung: GalatHitung | null; hasilUsang: boolean; tetap?: object | null }

export type KeadaanCariTempat =
  | { jenis: 'kurang_lokasi'; berbagi: number; total: number }
  | { jenis: 'bisa_dicari'; berbagi: number; total: number }
  | { jenis: 'menghitung' }
  | { jenis: 'gagal'; galat: GalatHitung | null; bisaDicobaLagi: boolean }
  | { jenis: 'siap'; usang: boolean; bisaHitungUlang: boolean }
  | { jenis: 'tetap' }

/** Apa yang ditampilkan bagian "Cari tempat", dari status room dan berapa orang yang sudah berbagi lokasi. */
export function keadaanCariTempat(room: RoomHasil, berbagi: number, total: number): KeadaanCariTempat {
  const cukup = berbagi >= MIN_LOKASI_HITUNG
  switch (room.status) {
    case 'menghitung':
      return { jenis: 'menghitung' }
    case 'siap':
      // Selama tetap, voting dan hitung ditolak backend, jadi lokasi yang berubah tidak memunculkan Hitung ulang (Discussions #42).
      if (room.tetap) return { jenis: 'tetap' }
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

/**
 * Pesan galat LOKASI_TIDAK_TERJANGKAU (#53): siapa yang perlu memperbarui lokasinya ke titik yang dekat jalan.
 * Kalau orangnya sudah keluar room, pesannya umum, karena mencari lagi tanpa dia bisa berhasil.
 */
export function pesanLokasiTidakTerjangkau<Id>(idTakTerjangkau: Id | null, peserta: readonly { id: Id; nama: string }[], idSaya: Id) {
  const orang = peserta.find((p) => p.id === idTakTerjangkau)
  if (!orang) return 'Ada lokasi yang terlalu jauh dari jalan, jadi waktu tempuhnya belum bisa dihitung. Coba lagi.'
  if (orang.id === idSaya) {
    return 'Lokasimu terlalu jauh dari jalan, jadi waktu tempuhnya tidak bisa dihitung. Perbarui lokasimu ke titik yang dekat jalan, lalu coba lagi.'
  }
  return `Lokasi ${orang.nama} terlalu jauh dari jalan, jadi waktu tempuhnya tidak bisa dihitung. Minta ${orang.nama} memperbarui lokasinya ke titik yang dekat jalan, lalu coba lagi.`
}

/**
 * Siapa yang menetapkan tempat (Discussions #42). Kalau orangnya sudah keluar room, tanpa nama.
 */
export function teksPenetap<Id>(olehPesertaId: Id, peserta: readonly { id: Id; nama: string }[], idSaya: Id) {
  if (olehPesertaId === idSaya) return 'Ditetapkan olehmu'
  const orang = peserta.find((p) => p.id === olehPesertaId)
  return orang ? `Ditetapkan oleh ${orang.nama}` : 'Ditetapkan'
}

const LABEL_KATEGORI: Record<KategoriTempat, string> = { kafe: 'Kafe', resto: 'Resto', mall: 'Mal', stasiun: 'Stasiun' }
export const labelKategori = (kategori: KategoriTempat) => LABEL_KATEGORI[kategori]

/** Membuka tempat di Google Maps (atau aplikasi peta bawaan HP) untuk melihat foto, ulasan, dan rute. */
export const linkMaps = ({ lat, lng }: Titik) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

/**
 * Rute di Google Maps dari lokasi HP sendiri ke tempat kumpul. Titik awalnya diambil Google Maps sendiri,
 * jadi lokasi kita tidak ikut di link. Motor memakai mode mobil, seperti di OpenRouteService.
 */
export const linkRute = ({ lat, lng }: Titik, kendaraan: 'motor' | 'mobil' | 'jalan_kaki') =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${kendaraan === 'jalan_kaki' ? 'walking' : 'driving'}`

type IsiTeksHasil = {
  namaTempat: string
  kategori: KategoriTempat
  alamat: string | null
  lokasi: Titik
  baris: readonly { nama: string; menit: number }[]
  terlamaMenit: number
  jumlahPemilih: number
  jumlahPeserta: number
  linkRoom: string
  /** Sudah ditetapkan (Discussions #42): pesannya jadi versi final. */
  tetap?: boolean
}

/**
 * Pesan kartu hasil untuk grup WhatsApp. Teks biasa dengan tebal ala WhatsApp (*...*), tanpa emoji,
 * supaya tetap rapi di semua HP. Link room ditaruh terakhir supaya WhatsApp menampilkan pratinjaunya.
 */
export function teksHasil(isi: IsiTeksHasil): string {
  const keterangan = [labelKategori(isi.kategori), isi.alamat].filter(Boolean).join(' · ')
  const waktu = isi.baris.map((b) => `${b.nama} ${b.menit} mnt`).join(', ')
  const pilihan = isi.tetap
    ? 'Sudah fix, sampai ketemu di sana!'
    : isi.jumlahPemilih > 0
      ? `Dipilih ${isi.jumlahPemilih} dari ${isi.jumlahPeserta} orang.`
      : 'Belum ada yang memilih, jadi ini tempat yang paling adil.'
  return [
    `${isi.tetap ? 'Fix! ' : ''}Ketemuan di *${isi.namaTempat}* (${keterangan})`,
    `Maps: ${linkMaps(isi.lokasi)}`,
    `Waktu tempuh: ${waktu}. Terlama ${isi.terlamaMenit} mnt.`,
    `${pilihan} ${isi.tetap ? 'Detailnya di Tikoem' : 'Lihat semua pilihan di Tikoem'}: ${isi.linkRoom}`,
  ].join('\n')
}
