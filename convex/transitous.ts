import type { Titik } from '../src/domain/lokasi'
import type { BagianPerjalanan, PilihanPerjalanan } from '../src/domain/ringkasanRute'
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
 * Tim Transitous mengizinkan pemakaian ini di channel Matrix mereka pada 21 Oktober 2026 (#58), selama Tikoem 100% open
 * source dan orang lain bisa menjalankan ulang seluruh setup-nya. Kata mereka, endpoint `experimental` dan API tanpa versi
 * lainnya bisa berubah tanpa pemberitahuan. Kalau bentuk jawabannya berubah, `bacaDurasi` dan `bacaRencana` menolaknya:
 * hitung berakhir LAYANAN_GAGAL, dan ringkasan rute jadi `gagal`.
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
 * Isi jawaban Transitous, dengan antrean, batas waktu, dan User-Agent Tikoem. Pesan galat dari Transitous bisa memuat
 * koordinat, jadi yang diteruskan hanya status HTTP-nya (AGENTS.md §8). Isi yang bukan JSON jadi `null`.
 */
async function mintaKeTransitous(url: string, { ambil = fetch, batasMs = 10_000, antre }: OpsiTransitous): Promise<unknown> {
  // Antre sebelum jam dinyalakan, jadi waktu menunggu giliran tidak memakan batas waktu permintaan.
  await antre?.()
  const henti = new AbortController()
  const jam = setTimeout(() => henti.abort(), batasMs)
  try {
    const jawaban = await ambil(url, { headers: { Accept: 'application/json', 'User-Agent': PENGENAL }, signal: henti.signal })
    if (jawaban.status === 429) throw new TransitousSibuk(bacaRetryAfter(jawaban.headers.get('Retry-After')))
    if (!jawaban.ok) throw new TransitousGagal(`Transitous menjawab HTTP ${jawaban.status}`)
    return await jawaban.json().catch(() => null)
  } catch (galat) {
    if (galat instanceof TransitousGagal) throw galat
    throw new TransitousGagal(`Transitous gagal: ${galat instanceof Error ? galat.name : 'galat tidak dikenal'}`)
  } finally {
    clearTimeout(jam)
  }
}

/**
 * Detik dari satu asal ke tiap tujuan lewat Transitous (MOTIS `one-to-many-intermodal`), yaitu yang tercepat antara jalan
 * kaki langsung dan transportasi umum, termasuk jalan kaki ke dan dari halte atau stasiun. `null` berarti tidak ada rute
 * dalam 3 jam.
 */
export async function durasiTransportasiUmum(
  asal: Titik,
  tujuan: readonly Titik[],
  { urlDasar = URL_DASAR_TRANSITOUS, berangkat, ...opsi }: OpsiTransitous = {},
): Promise<(number | null)[]> {
  const waktu = berangkat === undefined ? '' : `&time=${new Date(berangkat).toISOString()}`
  const kueri = `one=${titik(asal)}&many=${tujuan.map(titik).join(',')}&maxTravelTime=${MAKS_MENIT}${waktu}`
  return bacaDurasi(await mintaKeTransitous(`${urlDasar}/api/experimental/one-to-many-intermodal?${kueri}`, opsi), tujuan.length)
}

type OpsiRencana = Omit<OpsiTransitous, 'berangkat'> & {
  /** Jam berangkat, atau jam sampai paling lambat kalau `tiba`. */
  waktu: number
  tiba: boolean
}

/**
 * Pilihan perjalanan dari satu titik ke satu tempat lewat Transitous (MOTIS `/api/v6/plan`), untuk ringkasan rute
 * (Discussions #83). Jalan kaki langsung ikut sebagai pilihan tanpa pindah kendaraan. Garis rutenya tidak diminta
 * (`detailedLegs=false`), karena isinya koordinat dan tidak dipakai.
 */
export async function rencanaPerjalanan(
  asal: Titik,
  tujuan: Titik,
  { urlDasar = URL_DASAR_TRANSITOUS, waktu, tiba, ...opsi }: OpsiRencana,
): Promise<PilihanPerjalanan[]> {
  const kueri = `fromPlace=${asal.lat},${asal.lng}&toPlace=${tujuan.lat},${tujuan.lng}&time=${new Date(waktu).toISOString()}&arriveBy=${tiba}&detailedLegs=false`
  return bacaRencana(await mintaKeTransitous(`${urlDasar}/api/v6/plan?${kueri}`, opsi))
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

const objek = (isi: unknown): Record<string, unknown> => {
  if (typeof isi !== 'object' || isi === null || Array.isArray(isi)) throw bentukAsing()
  return isi as Record<string, unknown>
}
const teks = (isi: unknown): string => {
  if (typeof isi !== 'string' || isi === '') throw bentukAsing()
  return isi
}
const teksBoleh = (isi: unknown) => (typeof isi === 'string' && isi !== '' ? isi : null)
const jamDari = (isi: unknown) => {
  const waktu = typeof isi === 'string' ? Date.parse(isi) : Number.NaN
  if (Number.isNaN(waktu)) throw bentukAsing()
  return waktu
}

/** Satu `Leg` MOTIS. Koordinatnya tidak dibaca. */
function bacaBagian(isi: unknown): BagianPerjalanan {
  const leg = objek(isi)
  const perhentian = leg.intermediateStops ?? []
  if (!Array.isArray(perhentian)) throw bentukAsing()
  return {
    moda: teks(leg.mode),
    mulai: jamDari(leg.startTime),
    selesai: jamDari(leg.endTime),
    dari: teks(objek(leg.from).name),
    ke: teks(objek(leg.to).name),
    jalurPendek: teksBoleh(leg.routeShortName),
    jalurPanjang: teksBoleh(leg.routeLongName),
    arah: teksBoleh(leg.headsign),
    ujung: leg.tripTo === undefined ? null : teksBoleh(objek(leg.tripTo).name),
    operator: teksBoleh(leg.agencyName),
    perhentian: perhentian.length,
    warna: teksBoleh(leg.routeColor),
    warnaTeks: teksBoleh(leg.routeTextColor),
  }
}

/** Satu `Itinerary` MOTIS. */
function bacaPilihan(isi: unknown): PilihanPerjalanan {
  const pilihan = objek(isi)
  if (!Array.isArray(pilihan.legs) || pilihan.legs.length === 0) throw bentukAsing()
  if (typeof pilihan.transfers !== 'number' || pilihan.transfers < 0) throw bentukAsing()
  return { berangkat: jamDari(pilihan.startTime), sampai: jamDari(pilihan.endTime), pindah: pilihan.transfers, bagian: pilihan.legs.map(bacaBagian) }
}

/** `itineraries` berisi pilihan dengan transportasi umum, dan `direct` berisi jalan kaki langsung kalau tidak terlalu jauh. */
function bacaRencana(isi: unknown): PilihanPerjalanan[] {
  const rencana = objek(isi)
  const langsung = rencana.direct ?? []
  if (!Array.isArray(rencana.itineraries) || !Array.isArray(langsung)) throw bentukAsing()
  return [...rencana.itineraries, ...langsung].map(bacaPilihan)
}
