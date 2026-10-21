import type { Titik } from '../src/domain/lokasi'
import { PENGENAL } from './pengenal'

export type OpsiTransitous = {
  /** Kosong berarti server asli. Diisi dari env `TRANSITOUS_URL`, misalnya oleh E2E (e2e/layanan-tiruan.ts). */
  urlDasar?: string
  ambil?: typeof fetch
  batasMs?: number
  /** Jam berangkat. Kosong berarti sekarang, menurut jam Transitous. */
  berangkat?: number
  /** Dipanggil tepat sebelum permintaan dikirim, untuk menunggu giliran di antrean. */
  antre?: () => Promise<void>
}

/**
 * Tim Transitous mengizinkan pemakaian ini di channel Matrix mereka pada 21 Oktober 2026 (#58). Kata mereka, endpoint
 * `experimental` dan API tanpa versi lainnya bisa berubah tanpa pemberitahuan. Kalau bentuk jawabannya berubah, `bacaDurasi`
 * menolaknya dan room berakhir LAYANAN_GAGAL.
 */
const URL_DASAR_TRANSITOUS = 'https://api.transitous.org'

/** Perjalanan yang lebih lama dari ini dianggap tidak punya rute ke tempat itu (Discussions #63). */
const MAKS_MENIT = 180

export class TransitousGagal extends Error {
  override name = 'TransitousGagal'
}

/**
 * Transitous menjawab 429 karena permintaan dari Tikoem terlalu banyak. Mereka minta app mundur dulu, bukan langsung
 * mengirim ulang, jadi room lain ikut berhenti bertanya selama jedanya (`catatSibuk` di convex/batasLaju.ts).
 */
export class TransitousSibuk extends TransitousGagal {
  override name = 'TransitousSibuk'
  constructor(
    /** Dari header Retry-After, kalau ada dan bisa dibaca. */
    readonly mintaJedaMs?: number,
  ) {
    super('Transitous menjawab HTTP 429')
  }
}

const bentukAsing = () => new TransitousGagal('Bentuk jawaban Transitous tidak dikenali')

/** MOTIS menulis titik sebagai "lintang;bujur", dan beberapa titik dipisah koma. */
const titik = ({ lat, lng }: Titik) => `${lat};${lng}`

/**
 * Detik dari satu asal ke tiap tujuan lewat Transitous (MOTIS `one-to-many-intermodal`), yaitu yang tercepat antara jalan
 * kaki langsung dan transportasi umum, termasuk jalan kaki ke dan dari halte atau stasiun. `null` berarti tidak ada rute
 * dalam 3 jam. Pesan galat dari Transitous bisa memuat koordinat, jadi yang diteruskan hanya status HTTP-nya (AGENTS.md §8).
 */
export async function durasiTransportasiUmum(
  asal: Titik,
  tujuan: readonly Titik[],
  { urlDasar = URL_DASAR_TRANSITOUS, ambil = fetch, batasMs = 10_000, berangkat, antre }: OpsiTransitous = {},
): Promise<(number | null)[]> {
  const waktu = berangkat === undefined ? '' : `&time=${new Date(berangkat).toISOString()}`
  const kueri = `one=${titik(asal)}&many=${tujuan.map(titik).join(',')}&maxTravelTime=${MAKS_MENIT}${waktu}`
  const url = `${urlDasar}/api/experimental/one-to-many-intermodal?${kueri}`
  // Antre sebelum jam dinyalakan, jadi waktu menunggu giliran tidak memakan batas waktu permintaan.
  await antre?.()
  const henti = new AbortController()
  const jam = setTimeout(() => henti.abort(), batasMs)
  try {
    const jawaban = await ambil(url, { headers: { Accept: 'application/json', 'User-Agent': PENGENAL }, signal: henti.signal })
    if (jawaban.status === 429) throw new TransitousSibuk(bacaRetryAfter(jawaban.headers.get('Retry-After')))
    if (!jawaban.ok) throw new TransitousGagal(`Transitous menjawab HTTP ${jawaban.status}`)
    return bacaDurasi(await jawaban.json().catch(() => null), tujuan.length)
  } catch (galat) {
    if (galat instanceof TransitousGagal) throw galat
    throw new TransitousGagal(`Transitous gagal: ${galat instanceof Error ? galat.name : 'galat tidak dikenal'}`)
  } finally {
    clearTimeout(jam)
  }
}

/** Retry-After berisi jumlah detik atau tanggal HTTP. Isi yang tidak bisa dibaca diabaikan. */
function bacaRetryAfter(isi: string | null): number | undefined {
  if (isi === null) return undefined
  if (/^\d+$/.test(isi.trim())) return Number(isi.trim()) * 1000
  const pada = Date.parse(isi)
  return Number.isNaN(pada) ? undefined : Math.max(0, pada - Date.now())
}

/** Daftar per tujuan di bawah `kunci`, atau `null` kalau tidak ada. Jawaban `{}` berarti tidak ada rute ke tujuan mana pun. */
function perTujuan(isi: object, kunci: 'street_durations' | 'transit_durations', jumlahTujuan: number): unknown[] | null {
  if (!(kunci in isi)) return null
  const daftar: unknown = (isi as Record<string, unknown>)[kunci]
  if (!Array.isArray(daftar) || daftar.length !== jumlahTujuan) throw bentukAsing()
  return daftar
}

/** Detik dari satu `Duration` atau `ParetoSetEntry`. `Duration` tanpa `duration` berarti tidak ada rute. */
function detik(isi: unknown): number | null {
  if (typeof isi !== 'object' || isi === null) throw bentukAsing()
  if (!('duration' in isi)) return null
  if (typeof isi.duration !== 'number' || isi.duration < 0) throw bentukAsing()
  return isi.duration
}

/**
 * `street_durations[j]` adalah jalan kaki langsung ke tujuan ke-j, dan `transit_durations[j]` berisi pilihan transportasi
 * umum ke sana dengan jumlah pindah kendaraan yang berbeda.
 */
function bacaDurasi(isi: unknown, jumlahTujuan: number): (number | null)[] {
  if (typeof isi !== 'object' || isi === null) throw bentukAsing()
  const jalanKaki = perTujuan(isi, 'street_durations', jumlahTujuan)
  const umum = perTujuan(isi, 'transit_durations', jumlahTujuan)
  return Array.from({ length: jumlahTujuan }, (_, j) => {
    const pilihan = umum?.[j] ?? []
    if (!Array.isArray(pilihan)) throw bentukAsing()
    const semua = [jalanKaki ? detik(jalanKaki[j]) : null, ...pilihan.map(detik)].filter((d): d is number => d !== null)
    const tercepat = semua.length > 0 ? Math.min(...semua) : null
    return tercepat !== null && tercepat <= MAKS_MENIT * 60 ? tercepat : null
  })
}
