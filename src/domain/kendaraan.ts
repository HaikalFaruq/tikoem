/** Sama dengan `vKendaraan` di convex/schema.ts. Motor dihitung pakai profil mobil di OpenRouteService. */
export const KENDARAAN = [
  { nilai: 'motor', label: 'Motor' },
  { nilai: 'mobil', label: 'Mobil' },
  { nilai: 'jalan_kaki', label: 'Jalan kaki' },
] as const

export type Kendaraan = (typeof KENDARAAN)[number]['nilai']

export const labelKendaraan = (nilai: Kendaraan) => KENDARAAN.find((k) => k.nilai === nilai)!.label
