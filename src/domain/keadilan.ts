import type { Kendaraan } from './kendaraan'

/** Jumlah kandidat yang ditampilkan setelah diurutkan menurut keadilan (Discussions #8). */
export const JUMLAH_KANDIDAT_AKHIR = 5

export type ProfilRute = 'driving-car' | 'foot-walking'

/**
 * OpenRouteService tidak punya profil motor, jadi motor memakai profil mobil (#1). Transportasi umum tidak lewat ORS,
 * melainkan Transitous (Discussions #63).
 */
export const PROFIL_RUTE: Record<Exclude<Kendaraan, 'transportasi_umum'>, ProfilRute> = {
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

/**
 * Stasiun dan halte paling banyak dua dari lima kandidat akhir, supaya kafe dan resto tetap jadi pilihan utama. Keduanya
 * hanya dicari kalau ada yang naik transportasi umum (Discussions #63).
 */
export const MAKS_STASIUN = 2

type BisaDinilai = { osmId: string; kategori: string; jarakDariTengahMeter: number; waktuTempuh: readonly { menit: number }[] }

/**
 * Kandidat paling adil lebih dulu (Discussions #8):
 * waktu tempuh terlama paling pendek, lalu selisih paling kecil, lalu paling dekat ke titik tengah.
 * Stasiun yang melebihi `MAKS_STASIUN` dilewati, dan tempatnya diisi kandidat berikutnya.
 */
export function peringkatKandidat<T extends BisaDinilai>(
  kandidat: readonly T[],
  jumlah = JUMLAH_KANDIDAT_AKHIR,
): (T & DinilaiKeadilan & { peringkat: number })[] {
  const urut = kandidat
    .map((k) => ({ ...k, ...nilaiKeadilan(k.waktuTempuh.map((w) => w.menit)) }))
    .toSorted(
      (a, b) =>
        a.terlamaMenit - b.terlamaMenit ||
        a.selisihMenit - b.selisihMenit ||
        a.jarakDariTengahMeter - b.jarakDariTengahMeter ||
        a.osmId.localeCompare(b.osmId),
    )
  const terpilih: typeof urut = []
  for (const k of urut) {
    if (terpilih.length >= jumlah) break
    const jumlahStasiun = terpilih.filter((t) => t.kategori === 'stasiun').length
    if (k.kategori === 'stasiun' && jumlahStasiun >= MAKS_STASIUN) continue
    terpilih.push(k)
  }
  return terpilih.map((k, i) => ({ ...k, peringkat: i + 1 }))
}
