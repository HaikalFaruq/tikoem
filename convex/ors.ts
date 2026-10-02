import type { Titik } from '../src/domain/lokasi'
import type { ProfilRute } from '../src/domain/keadilan'
import { PENGENAL } from './pengenal'

export type OpsiOrs = { kunci: string; ambil?: typeof fetch; batasMs?: number }

/** Kode galat ORS saat salah satu titik terlalu jauh dari jalan yang bisa dilewati. */
export const KODE_TITIK_TIDAK_TERJANGKAU = 6010

export class OrsGagal extends Error {
  override name = 'OrsGagal'
  constructor(
    pesan: string,
    readonly kode?: number,
    /** Urutan titik bermasalah di `locations`, kalau ORS menyebutnya. */
    readonly indeksTitik?: number,
  ) {
    super(pesan)
  }
}

/**
 * Durasi dalam detik dari tiap asal ke tiap tujuan lewat OpenRouteService Matrix. `null` berarti tidak ada rute.
 * Pesan galat dari ORS bisa memuat koordinat, jadi yang diteruskan hanya status HTTP dan kode galatnya (AGENTS.md §8).
 */
export async function matriksDurasi(
  asal: readonly Titik[],
  tujuan: readonly Titik[],
  profil: ProfilRute,
  { kunci, ambil = fetch, batasMs = 10_000 }: OpsiOrs,
): Promise<(number | null)[][]> {
  const henti = new AbortController()
  const jam = setTimeout(() => henti.abort(), batasMs)
  try {
    const jawaban = await ambil(`https://api.openrouteservice.org/v2/matrix/${profil}`, {
      method: 'POST',
      headers: { Authorization: kunci, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': PENGENAL },
      body: JSON.stringify({
        locations: [...asal, ...tujuan].map((t) => [t.lng, t.lat]),
        sources: asal.map((_, i) => i),
        destinations: tujuan.map((_, i) => asal.length + i),
        metrics: ['duration'],
      }),
      signal: henti.signal,
    })
    const isi: unknown = await jawaban.json().catch(() => null)
    if (!jawaban.ok) {
      const { kode, indeksTitik } = bacaGalat(isi)
      throw new OrsGagal(`ORS menjawab HTTP ${jawaban.status}${kode ? `, kode ${kode}` : ''}`, kode, indeksTitik)
    }
    return bacaDurasi(isi, asal.length, tujuan.length)
  } catch (galat) {
    throw galat instanceof OrsGagal ? galat : new OrsGagal(`ORS gagal: ${galat instanceof Error ? galat.name : 'galat tidak dikenal'}`)
  } finally {
    clearTimeout(jam)
  }
}

function bacaGalat(isi: unknown): { kode?: number; indeksTitik?: number } {
  const galat = typeof isi === 'object' && isi !== null && 'error' in isi ? isi.error : null
  if (typeof galat !== 'object' || galat === null) return {}
  const kode = 'code' in galat && typeof galat.code === 'number' ? galat.code : undefined
  const pesan = 'message' in galat && typeof galat.message === 'string' ? galat.message : ''
  const indeks = /coordinate (\d+)/.exec(pesan)?.[1]
  return { kode, indeksTitik: indeks === undefined ? undefined : Number(indeks) }
}

function bacaDurasi(isi: unknown, jumlahAsal: number, jumlahTujuan: number): (number | null)[][] {
  const durasi = typeof isi === 'object' && isi !== null && 'durations' in isi ? isi.durations : null
  const sah =
    Array.isArray(durasi) &&
    durasi.length === jumlahAsal &&
    durasi.every(
      (baris) => Array.isArray(baris) && baris.length === jumlahTujuan && baris.every((d) => d === null || (typeof d === 'number' && d >= 0)),
    )
  if (!sah) throw new OrsGagal('Bentuk jawaban ORS tidak dikenali')
  return durasi as (number | null)[][]
}
