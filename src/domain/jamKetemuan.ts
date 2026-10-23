import { hariJakarta, jamJakarta, tanggalJakarta } from '../lib/waktu'

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

/** Jam ketemuan di teks untuk grup WA, yang bisa dibaca lusa: "Senin, 26 Okt · 19.00 WIB". */
export const teksJamKetemuan = (waktu: number) => `${hariJakarta(waktu)} · ${jamJakarta(waktu)} WIB`

/** Jam ketemuan di layar. Hari ini dan besok disebut begitu supaya cepat dibaca: "Besok · 19.00 WIB". */
export function labelJamKetemuan(waktu: number, sekarang: number): string {
  const tanggal = tanggalJakarta(waktu)
  const hari = tanggal === tanggalJakarta(sekarang) ? 'Hari ini' : tanggal === tanggalJakarta(sekarang + HARI) ? 'Besok' : hariJakarta(waktu)
  return `${hari} · ${jamJakarta(waktu)} WIB`
}

/** Isian jam ketemuan di layar: tanggal Jakarta ("2026-10-26") dan jam seperti `<input type="time">` ("19:00"). */
export type IsianJam = { tanggal: string; jam: string }

/** Jam yang paling sering dipakai untuk ketemuan sepulang kerja, jadi isiannya mulai dari sini. */
const JAM_AWAL = '19:00'
/** Kalau jam awal hari ini kurang dari segini lagi, isiannya mulai dari besok. */
const JEDA_AWAL_MS = 30 * MENIT

/**
 * Pilihan hari di isian: hari ini sampai 6 hari lagi. Hari ke-7 tidak ditawarkan, karena hanya jam sebelum jam sekarang yang
 * masih boleh.
 */
export function pilihanHari(sekarang: number): { nilai: string; label: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const waktu = sekarang + i * HARI
    return { nilai: tanggalJakarta(waktu), label: i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : hariJakarta(waktu, true) }
  })
}

export const waktuDariIsian = ({ tanggal, jam }: IsianJam) => Date.parse(`${tanggal}T${jam}:00+07:00`)

/** Isi awal saat isian dibuka: jam ketemuan yang sudah ada, atau pukul 19.00 hari ini (besok kalau sudah terlalu dekat). */
export function isianAwal(jamKetemuan: number | null, sekarang: number): IsianJam {
  if (jamKetemuan !== null) return { tanggal: tanggalJakarta(jamKetemuan), jam: jamJakarta(jamKetemuan).replace('.', ':') }
  const hariIni = { tanggal: tanggalJakarta(sekarang), jam: JAM_AWAL }
  return waktuDariIsian(hariIni) - JEDA_AWAL_MS >= sekarang ? hariIni : { tanggal: tanggalJakarta(sekarang + HARI), jam: JAM_AWAL }
}

/** Pesan kalau isian tidak akan diterima `room.ubahJamKetemuan`, dengan aturan yang sama (`rapikanJamKetemuan`). */
export function galatIsianJam(isian: IsianJam, sekarang: number): string | null {
  const waktu = waktuDariIsian(isian)
  if (!Number.isFinite(waktu)) return 'Isi jamnya dulu.'
  if (rapikanJamKetemuan(waktu, sekarang) !== null) return null
  return waktu < sekarang ? 'Jam itu sudah lewat. Pilih jam lain.' : 'Paling jauh 7 hari dari sekarang. Pilih hari lain.'
}
