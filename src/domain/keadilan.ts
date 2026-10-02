import type { Kendaraan } from './kendaraan'

/** Jumlah kandidat yang ditampilkan setelah diurutkan menurut keadilan (Discussions #8). */
export const JUMLAH_KANDIDAT_AKHIR = 5

export type ProfilRute = 'driving-car' | 'foot-walking'

/** OpenRouteService tidak punya profil motor, jadi motor memakai profil mobil (#1). */
export const PROFIL_RUTE: Record<Kendaraan, ProfilRute> = {
  motor: 'driving-car',
  mobil: 'driving-car',
  jalan_kaki: 'foot-walking',
}

/** Dibulatkan ke atas supaya "terlama" dan "selisih" selalu cocok dengan angka per orang di kartu (Discussions #8). */
export const menitDariDetik = (detik: number) => Math.ceil(detik / 60)

export type DinilaiKeadilan = { terlamaMenit: number; selisihMenit: number }

export function nilaiKeadilan(menit: readonly number[]): DinilaiKeadilan {
  const terlama = Math.max(...menit)
  return { terlamaMenit: terlama, selisihMenit: terlama - Math.min(...menit) }
}

type BisaDinilai = { osmId: string; jarakDariTengahMeter: number; waktuTempuh: readonly { menit: number }[] }

/**
 * Kandidat paling adil lebih dulu (Discussions #8):
 * waktu tempuh terlama paling pendek, lalu selisih paling kecil, lalu paling dekat ke titik tengah.
 */
export function peringkatKandidat<T extends BisaDinilai>(
  kandidat: readonly T[],
  jumlah = JUMLAH_KANDIDAT_AKHIR,
): (T & DinilaiKeadilan & { peringkat: number })[] {
  return kandidat
    .map((k) => ({ ...k, ...nilaiKeadilan(k.waktuTempuh.map((w) => w.menit)) }))
    .toSorted(
      (a, b) =>
        a.terlamaMenit - b.terlamaMenit ||
        a.selisihMenit - b.selisihMenit ||
        a.jarakDariTengahMeter - b.jarakDariTengahMeter ||
        a.osmId.localeCompare(b.osmId),
    )
    .slice(0, jumlah)
    .map((k, i) => ({ ...k, peringkat: i + 1 }))
}
