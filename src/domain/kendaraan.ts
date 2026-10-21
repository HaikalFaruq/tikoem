/** Sama dengan `vKendaraan` di convex/schema.ts. Motor dihitung pakai profil mobil di OpenRouteService. */
const SEMUA_KENDARAAN = [
  { nilai: 'motor', label: 'Motor' },
  { nilai: 'mobil', label: 'Mobil' },
  { nilai: 'jalan_kaki', label: 'Jalan kaki' },
  { nilai: 'transportasi_umum', label: 'Transportasi umum' },
] as const

export type Kendaraan = (typeof SEMUA_KENDARAAN)[number]['nilai']

/**
 * Pilihan di layar. Transportasi umum sudah diterima backend (Discussions #63), tapi baru ditawarkan setelah waktu tempuhnya
 * dihitung lewat Transitous asli (#58). Sampai saat itu, hitung untuk kendaraan ini hanya jalan dengan Transitous tiruan di E2E.
 */
export const KENDARAAN = SEMUA_KENDARAAN.filter((k) => k.nilai !== 'transportasi_umum')

export const labelKendaraan = (nilai: Kendaraan) => SEMUA_KENDARAAN.find((k) => k.nilai === nilai)!.label
