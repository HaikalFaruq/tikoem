import type { Kendaraan } from './kendaraan'

const MENIT = 60_000

/**
 * Cadangan untuk macet (Discussions #83). Waktu tempuh motor dan mobil dari OpenRouteService tidak tahu kondisi lalu lintas.
 * Jalan kaki tidak butuh cadangan, dan transportasi umum memakai jam jadwal dari ringkasan rute.
 */
const CADANGAN_MENIT: Record<Exclude<Kendaraan, 'transportasi_umum'>, number> = { motor: 10, mobil: 10, jalan_kaki: 0 }

/** Perkiraan jam berangkat untuk motor, mobil, dan jalan kaki: jam ketemuan dikurangi waktu tempuh dan cadangannya. */
export function perkiraanBerangkat(jamKetemuan: number, menit: number, kendaraan: Exclude<Kendaraan, 'transportasi_umum'>) {
  const cadanganMenit = CADANGAN_MENIT[kendaraan]
  return { berangkat: jamKetemuan - (menit + cadanganMenit) * MENIT, cadanganMenit }
}

/** Lama perjalanan di ringkasan rute dalam menit, dibulatkan ke atas. */
export const lamaPerjalanan = ({ berangkat, sampai }: { berangkat: number; sampai: number }) => Math.ceil((sampai - berangkat) / MENIT)

/** "lewat 3 stasiun" atau "lewat 17 halte". Kosong kalau langsung turun di perhentian berikutnya. */
export function teksLewat(jenis: 'kereta' | 'bus', perhentian: number): string | null {
  if (perhentian <= 0) return null
  return `lewat ${perhentian} ${jenis === 'kereta' ? 'stasiun' : 'halte'}`
}

/** Nama di chip jalur: nama jalur KRL ("Commuter Line Bogor"), atau layanan dan nomor koridor bus ("TransJakarta 9A"). */
export function namaJalur({ jenis, layanan, jalur }: { jenis: 'kereta' | 'bus'; layanan: string; jalur: string }): string {
  if (jenis === 'kereta' || jalur === layanan) return jalur
  return `${layanan} ${jalur}`
}
