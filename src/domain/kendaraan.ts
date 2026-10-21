/** Sama dengan `vKendaraan` di convex/schema.ts. Motor dihitung pakai profil mobil di OpenRouteService. */
const SEMUA_KENDARAAN = [
  { nilai: 'motor', label: 'Motor' },
  { nilai: 'mobil', label: 'Mobil' },
  { nilai: 'jalan_kaki', label: 'Jalan kaki' },
  { nilai: 'transportasi_umum', label: 'Transportasi umum' },
] as const

export type Kendaraan = (typeof SEMUA_KENDARAAN)[number]['nilai']

/**
 * Pilihan di layar. Waktu tempuh transportasi umum sudah dihitung lewat Transitous asli (#58), tapi pilihannya baru ditawarkan
 * bersama layarnya: pesan galat di kartu lokasi, catatan MRT/LRT dan akhir pekan, dan link ke transitous.org/sources yang
 * menjadi syarat Transitous (Discussions #63).
 */
export const KENDARAAN = SEMUA_KENDARAAN.filter((k) => k.nilai !== 'transportasi_umum')

export const labelKendaraan = (nilai: Kendaraan) => SEMUA_KENDARAAN.find((k) => k.nilai === nilai)!.label
