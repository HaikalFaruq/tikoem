import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { env, internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from './_generated/server'
import { tungguGiliran } from './batasLaju'
import { cariTempatSekitar } from './overpass'
import { KODE_TITIK_TIDAK_TERJANGKAU, OrsGagal, matriksDurasi, type OpsiOrs } from './ors'
import { vGalatHitung, vKandidat, vTitik } from './schema'
import { TransitousGagal, durasiTransportasiUmum } from './transitous'
import { PROFIL_RUTE, menitDariDetik, peringkatKandidat } from '../src/domain/keadilan'
import type { Kendaraan } from '../src/domain/kendaraan'
import type { Titik } from '../src/domain/lokasi'
import { MAKS_PESERTA } from '../src/domain/room'
import type { Tempat } from '../src/domain/tempat'
import { titikTengah } from '../src/domain/titikTengah'

/**
 * Kalau hitung belum selesai setelah ini, statusnya jadi `gagal` dengan LAYANAN_GAGAL, supaya layar bisa menampilkan "Coba lagi".
 * Overpass sendiri bisa makan dua putaran pencarian masing-masing 15 detik, ditambah OpenRouteService.
 */
export const BATAS_HITUNG_MS = 50_000

export type PesertaDihitung = { id: Id<'peserta'>; kendaraan: Kendaraan; lokasi: Titik }
type BahanHitung = { versiLokasi: number; peserta: PesertaDihitung[] }
type GalatHitung = Infer<typeof vGalatHitung>

/** Peserta yang sudah berbagi lokasi, dibaca di satu transaksi bersama `versiLokasi` yang sesuai. */
export const bahan = internalQuery({
  args: { roomId: v.id('room'), putaran: v.number() },
  handler: async (ctx, { roomId, putaran }): Promise<BahanHitung | null> => {
    const room = await ctx.db.get('room', roomId)
    if (!room || room.kedaluwarsa || room.status !== 'menghitung' || room.putaranHitung !== putaran) return null
    const peserta = await ctx.db
      .query('peserta')
      .withIndex('by_roomId_and_urutanGabung', (q) => q.eq('roomId', roomId))
      .take(MAKS_PESERTA)
    return {
      versiLokasi: room.versiLokasi ?? 0,
      peserta: peserta.flatMap((p) => (p.lokasi ? [{ id: p._id, kendaraan: p.kendaraan, lokasi: p.lokasi }] : [])),
    }
  },
})

/** Mengganti kandidat lama sekaligus, jadi layar tidak sempat berkedip kosong (Discussions #8). */
export const simpan = internalMutation({
  args: { roomId: v.id('room'), putaran: v.number(), versiLokasi: v.number(), titikTengah: vTitik, kandidat: v.array(vKandidat) },
  handler: async (ctx, { roomId, putaran, versiLokasi, titikTengah: tengah, kandidat }) => {
    const room = await ctx.db.get('room', roomId)
    // Room yang sudah berakhir sudah dihapus data pribadinya, jadi hasil yang datang terlambat tidak boleh menulis ulang.
    if (!room || room.kedaluwarsa || room.status !== 'menghitung' || room.putaranHitung !== putaran) return

    const lama = await ctx.db
      .query('kandidat')
      .withIndex('by_roomId_and_peringkat', (q) => q.eq('roomId', roomId))
      .take(50)
    for (const k of lama) await ctx.db.delete('kandidat', k._id)
    // Vote dikosongkan karena kandidatnya berubah.
    const vote = await ctx.db
      .query('vote')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .take(MAKS_PESERTA)
    for (const x of vote) await ctx.db.delete('vote', x._id)
    for (const k of kandidat) await ctx.db.insert('kandidat', { roomId, ...k })

    await ctx.db.patch('room', roomId, {
      status: 'siap',
      galatHitung: undefined,
      titikTengah: tengah,
      hasilPada: Date.now(),
      versiHasil: versiLokasi,
    })
  },
})

export const gagal = internalMutation({
  args: { roomId: v.id('room'), putaran: v.number(), galat: vGalatHitung, pesertaTidakTerjangkau: v.optional(v.id('peserta')) },
  handler: async (ctx, { roomId, putaran, galat, pesertaTidakTerjangkau }) => {
    await tandaiGagal(ctx, roomId, putaran, galat, pesertaTidakTerjangkau)
  },
})

/** Dijadwalkan bersama `jalankan`. Kalau hitung tergantung, room tidak tertahan di `menghitung` selamanya. */
export const batasWaktu = internalMutation({
  args: { roomId: v.id('room'), putaran: v.number() },
  handler: async (ctx, { roomId, putaran }) => {
    await tandaiGagal(ctx, roomId, putaran, 'LAYANAN_GAGAL')
  },
})

async function tandaiGagal(
  ctx: MutationCtx,
  roomId: Id<'room'>,
  putaran: number,
  galat: GalatHitung,
  pesertaTidakTerjangkau?: Id<'peserta'>,
) {
  const room = await ctx.db.get('room', roomId)
  if (room?.status === 'menghitung' && room.putaranHitung === putaran) {
    await ctx.db.patch('room', roomId, { status: 'gagal', galatHitung: galat, pesertaTidakTerjangkau })
  }
}

export const jalankan = internalAction({
  args: { roomId: v.id('room'), putaran: v.number() },
  handler: async (ctx, { roomId, putaran }) => {
    const data: BahanHitung | null = await ctx.runQuery(internal.hitung.bahan, { roomId, putaran })
    if (!data) return
    try {
      const hasil = await hitungHasil(data.peserta, {
        kunciOrs: env.ORS_API_KEY,
        urlOverpass: env.OVERPASS_URL,
        urlOrs: env.ORS_URL,
        urlTransitous: env.TRANSITOUS_URL,
        // Batas per menit hanya untuk ORS asli. Server lain yang diisi lewat ORS_URL, termasuk tiruan E2E, tidak antre.
        antreOrs: env.ORS_URL ? undefined : () => giliranOrs(ctx),
      })
      if ('galat' in hasil) await ctx.runMutation(internal.hitung.gagal, { roomId, putaran, ...hasil })
      else await ctx.runMutation(internal.hitung.simpan, { roomId, putaran, versiLokasi: data.versiLokasi, ...hasil })
    } catch (galat) {
      // Pesan galat Overpass, ORS, dan Transitous sengaja tidak memuat koordinat, jadi aman ditulis ke log (AGENTS.md §8).
      console.error(`Hitung room gagal: ${galat instanceof Error ? galat.message : 'galat tidak dikenal'}`)
      await ctx.runMutation(internal.hitung.gagal, { roomId, putaran, galat: 'LAYANAN_GAGAL' })
    }
  },
})

/** Menunggu giliran ke ORS. Kalau antreannya sudah penuh, hitung gagal tanpa memakai kuota ORS. */
async function giliranOrs(ctx: ActionCtx) {
  if (!(await tungguGiliran(ctx, 'ors'))) throw new OrsGagal('Antrean ORS penuh')
}

export type OpsiHitung = {
  kunciOrs: string | undefined
  ambil?: typeof fetch
  /** Kosong berarti server asli. Diisi dari env `OVERPASS_URL` dan `ORS_URL`, misalnya oleh E2E. */
  urlOverpass?: string
  urlOrs?: string
  /**
   * Dari env `TRANSITOUS_URL`. Kosong berarti Transitous belum disambungkan, karena izinnya belum jelas (#58), jadi
   * transportasi umum belum bisa dihitung. E2E mengisinya dengan server tiruan.
   */
  urlTransitous?: string
  /** Dipanggil sebelum tiap permintaan ORS. */
  antreOrs?: () => Promise<void>
}
export type HasilHitung =
  | { titikTengah: Titik; kandidat: Infer<typeof vKandidat>[] }
  | { galat: 'TEMPAT_TIDAK_DITEMUKAN' }
  | { galat: 'LOKASI_TIDAK_TERJANGKAU' | 'TRANSPORTASI_UMUM_TIDAK_TERJANGKAU'; pesertaTidakTerjangkau: Id<'peserta'> }

/** Profil ORS untuk kendaraan itu, atau `null` untuk transportasi umum yang dihitung lewat Transitous. */
const profilRute = (kendaraan: Kendaraan) => (kendaraan === 'transportasi_umum' ? null : PROFIL_RUTE[kendaraan])

/** Tempat yang terlalu jauh dari jalan, sehingga ORS menolak seluruh matriks. */
class TempatTakTerjangkau extends Error {
  constructor(readonly indeksTempat: number) {
    super('Tempat tidak terjangkau rute')
  }
}

/**
 * Lokasi peserta yang terlalu jauh dari jalan, misalnya pin yang jatuh di laut. Tidak ada tempat yang bisa dihitung
 * untuk orang ini, jadi hitung berhenti dan orangnya diminta menggeser lokasi (#53).
 */
class PesertaTakTerjangkau extends Error {
  constructor(readonly pesertaId: Id<'peserta'>) {
    super('Lokasi peserta tidak terjangkau rute')
  }
}

/**
 * Titik tengah, kandidat dari Overpass, waktu tempuh lewat ORS dan Transitous, lalu 5 kandidat paling adil.
 * Melempar galat kalau layanan luar gagal. Hasil `{ galat }` berarti memang tidak ada tempat yang bisa dipakai.
 */
export async function hitungHasil(
  peserta: readonly PesertaDihitung[],
  { kunciOrs, ambil = fetch, urlOverpass, urlOrs, urlTransitous, antreOrs }: OpsiHitung,
): Promise<HasilHitung> {
  const tengah = titikTengah(peserta.map((p) => p.lokasi))
  if (!tengah) return { galat: 'TEMPAT_TIDAK_DITEMUKAN' }
  if (!kunciOrs && peserta.some((p) => profilRute(p.kendaraan) !== null)) throw new OrsGagal('ORS_API_KEY belum diisi di env Convex')
  const naikUmum = peserta.filter((p) => p.kendaraan === 'transportasi_umum')
  if (!urlTransitous && naikUmum.length > 0) {
    throw new TransitousGagal('TRANSITOUS_URL belum diisi, jadi transportasi umum belum bisa dihitung')
  }

  let tempat = await cariTempatSekitar(tengah.titik, tengah.radiusMeter, {
    ambil,
    batasMs: 15_000,
    server: urlOverpass ? [urlOverpass] : undefined,
  })
  if (tempat.length === 0) return { galat: 'TEMPAT_TIDAK_DITEMUKAN' }

  // Satu permintaan Transitous per orang ke semua tempat, sekali saja. Menitnya disimpan menurut `osmId` tempatnya, jadi
  // tetap cocok walaupun ORS nanti membuang tempat yang jauh dari jalan.
  const menitUmum = new Map<Id<'peserta'>, Map<string, number>>()
  for (const p of naikUmum) {
    const detik = await durasiTransportasiUmum(p.lokasi, tempat.map((t) => t.lokasi), { urlDasar: urlTransitous!, ambil })
    if (detik.every((d) => d === null)) return { galat: 'TRANSPORTASI_UMUM_TIDAK_TERJANGKAU', pesertaTidakTerjangkau: p.id }
    const menitTempat = new Map<string, number>()
    tempat.forEach((t, j) => {
      const d = detik[j]
      if (d !== null) menitTempat.set(t.osmId, menitDariDetik(d))
    })
    menitUmum.set(p.id, menitTempat)
  }

  // Tempat yang ditolak ORS dibuang, lalu dicoba lagi. Tiga kali sudah lebih dari cukup untuk data kota.
  for (let percobaan = 0; percobaan < 3 && tempat.length > 0; percobaan++) {
    try {
      // Tanpa orang yang lewat ORS, key-nya tidak pernah dipakai.
      const opsiOrs = { kunci: kunciOrs ?? '', ambil, urlDasar: urlOrs, antre: antreOrs }
      const menit = await menitTiapPeserta(peserta, tempat, menitUmum, opsiOrs)
      const terjangkau = tempat.flatMap((t, j) => {
        if (peserta.some((_, i) => menit[i][j] === null)) return []
        return [
          {
            ...t,
            alamat: t.alamat ?? undefined,
            waktuTempuh: peserta.map((p, i) => ({ pesertaId: p.id, menit: menit[i][j] as number })),
          },
        ]
      })
      const kandidat = peringkatKandidat(terjangkau)
      return kandidat.length > 0 ? { titikTengah: tengah.titik, kandidat } : { galat: 'TEMPAT_TIDAK_DITEMUKAN' }
    } catch (galat) {
      if (galat instanceof PesertaTakTerjangkau) return { galat: 'LOKASI_TIDAK_TERJANGKAU', pesertaTidakTerjangkau: galat.pesertaId }
      if (!(galat instanceof TempatTakTerjangkau)) throw galat
      tempat = tempat.filter((_, j) => j !== galat.indeksTempat)
    }
  }
  return { galat: 'TEMPAT_TIDAK_DITEMUKAN' }
}

/**
 * Menit dari tiap peserta ke tiap tempat. Satu permintaan ORS untuk tiap profil rute yang dipakai. Orang yang naik
 * transportasi umum memakai `menitUmum` dari Transitous, dan tempat yang tidak ada di sana tidak punya rute.
 */
async function menitTiapPeserta(
  peserta: readonly PesertaDihitung[],
  tempat: readonly Tempat[],
  menitUmum: ReadonlyMap<Id<'peserta'>, ReadonlyMap<string, number>>,
  opsiOrs: OpsiOrs,
): Promise<(number | null)[][]> {
  const menit: (number | null)[][] = peserta.map((p) => tempat.map((t) => menitUmum.get(p.id)?.get(t.osmId) ?? null))
  for (const profil of new Set(peserta.flatMap((p) => profilRute(p.kendaraan) ?? []))) {
    const anggota = peserta.flatMap((p, i) => (profilRute(p.kendaraan) === profil ? [i] : []))
    let durasi: (number | null)[][]
    try {
      durasi = await matriksDurasi(
        anggota.map((i) => peserta[i].lokasi),
        tempat.map((t) => t.lokasi),
        profil,
        opsiOrs,
      )
    } catch (galat) {
      const indeks = galat instanceof OrsGagal && galat.kode === KODE_TITIK_TIDAK_TERJANGKAU ? galat.indeksTitik : undefined
      // Di `locations`, peserta ada di depan dan tempat di belakang.
      if (indeks !== undefined && indeks >= anggota.length) throw new TempatTakTerjangkau(indeks - anggota.length)
      if (indeks !== undefined) throw new PesertaTakTerjangkau(peserta[anggota[indeks]].id)
      throw galat
    }
    anggota.forEach((i, baris) => {
      menit[i] = durasi[baris].map((d) => (d === null ? null : menitDariDetik(d)))
    })
  }
  return menit
}
