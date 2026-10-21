/** Sama dengan `vKendaraan` di convex/schema.ts. Motor dihitung pakai profil mobil di OpenRouteService. */
const SEMUA_KENDARAAN = [
  { nilai: 'motor', label: 'Motor' },
  { nilai: 'mobil', label: 'Mobil' },
  { nilai: 'jalan_kaki', label: 'Jalan kaki' },
  { nilai: 'transportasi_umum', label: 'Transportasi umum' },
] as const

export type Kendaraan = (typeof SEMUA_KENDARAAN)[number]['nilai']

/** Pilihan di layar buat room, gabung, dan ganti kendaraan. */
export const KENDARAAN = SEMUA_KENDARAAN

export const labelKendaraan = (nilai: Kendaraan) => SEMUA_KENDARAAN.find((k) => k.nilai === nilai)!.label
