import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { env, internalAction, internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { cariTempatSekitar } from './overpass'
import { KODE_TITIK_TIDAK_TERJANGKAU, OrsGagal, matriksDurasi } from './ors'
import { vGalatHitung, vKandidat, vTitik } from './schema'
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
    if (!room || room.status !== 'menghitung' || room.putaranHitung !== putaran) return null
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
    if (!room || room.status !== 'menghitung' || room.putaranHitung !== putaran) return

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
  args: { roomId: v.id('room'), putaran: v.number(), galat: vGalatHitung },
  handler: async (ctx, { roomId, putaran, galat }) => {
    await tandaiGagal(ctx, roomId, putaran, galat)
  },
})

/** Dijadwalkan bersama `jalankan`. Kalau hitung tergantung, room tidak tertahan di `menghitung` selamanya. */
export const batasWaktu = internalMutation({
  args: { roomId: v.id('room'), putaran: v.number() },
  handler: async (ctx, { roomId, putaran }) => {
    await tandaiGagal(ctx, roomId, putaran, 'LAYANAN_GAGAL')
  },
})

async function tandaiGagal(ctx: MutationCtx, roomId: Id<'room'>, putaran: number, galat: GalatHitung) {
  const room = await ctx.db.get('room', roomId)
  if (room?.status === 'menghitung' && room.putaranHitung === putaran) {
    await ctx.db.patch('room', roomId, { status: 'gagal', galatHitung: galat })
  }
}

export const jalankan = internalAction({
  args: { roomId: v.id('room'), putaran: v.number() },
  handler: async (ctx, { roomId, putaran }) => {
    const data: BahanHitung | null = await ctx.runQuery(internal.hitung.bahan, { roomId, putaran })
    if (!data) return
    try {
      const hasil = await hitungHasil(data.peserta, { kunciOrs: env.ORS_API_KEY })
      if ('galat' in hasil) await ctx.runMutation(internal.hitung.gagal, { roomId, putaran, galat: hasil.galat })
      else await ctx.runMutation(internal.hitung.simpan, { roomId, putaran, versiLokasi: data.versiLokasi, ...hasil })
    } catch (galat) {
      // Pesan galat Overpass dan ORS sengaja tidak memuat koordinat, jadi aman ditulis ke log (AGENTS.md §8).
      console.error(`Hitung room gagal: ${galat instanceof Error ? galat.message : 'galat tidak dikenal'}`)
      await ctx.runMutation(internal.hitung.gagal, { roomId, putaran, galat: 'LAYANAN_GAGAL' })
    }
  },
})

export type OpsiHitung = { kunciOrs: string | undefined; ambil?: typeof fetch }
export type HasilHitung = { titikTengah: Titik; kandidat: Infer<typeof vKandidat>[] } | { galat: 'TEMPAT_TIDAK_DITEMUKAN' }

/** Tempat yang terlalu jauh dari jalan, sehingga ORS menolak seluruh matriks. */
class TempatTakTerjangkau extends Error {
  constructor(readonly indeksTempat: number) {
    super('Tempat tidak terjangkau rute')
  }
}

/**
 * Titik tengah, kandidat dari Overpass, waktu tempuh lewat ORS, lalu 5 kandidat paling adil.
 * Melempar galat kalau layanan luar gagal. Hasil `{ galat }` berarti memang tidak ada tempat yang bisa dipakai.
 */
export async function hitungHasil(peserta: readonly PesertaDihitung[], { kunciOrs, ambil = fetch }: OpsiHitung): Promise<HasilHitung> {
  const tengah = titikTengah(peserta.map((p) => p.lokasi))
  if (!tengah) return { galat: 'TEMPAT_TIDAK_DITEMUKAN' }
  if (!kunciOrs) throw new OrsGagal('ORS_API_KEY belum diisi di env Convex')

  let tempat = await cariTempatSekitar(tengah.titik, tengah.radiusMeter, { ambil, batasMs: 15_000 })
  // Tempat yang ditolak ORS dibuang, lalu dicoba lagi. Tiga kali sudah lebih dari cukup untuk data kota.
  for (let percobaan = 0; percobaan < 3 && tempat.length > 0; percobaan++) {
    try {
      const menit = await menitTiapPeserta(peserta, tempat, kunciOrs, ambil)
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
      if (!(galat instanceof TempatTakTerjangkau)) throw galat
      tempat = tempat.filter((_, j) => j !== galat.indeksTempat)
    }
  }
  return { galat: 'TEMPAT_TIDAK_DITEMUKAN' }
}

/** Menit dari tiap peserta ke tiap tempat. Satu permintaan ORS untuk tiap profil rute yang dipakai. */
async function menitTiapPeserta(
  peserta: readonly PesertaDihitung[],
  tempat: readonly Tempat[],
  kunci: string,
  ambil: typeof fetch,
): Promise<(number | null)[][]> {
  const menit: (number | null)[][] = peserta.map(() => [])
  for (const profil of new Set(peserta.map((p) => PROFIL_RUTE[p.kendaraan]))) {
    const anggota = peserta.flatMap((p, i) => (PROFIL_RUTE[p.kendaraan] === profil ? [i] : []))
    let durasi: (number | null)[][]
    try {
      durasi = await matriksDurasi(
        anggota.map((i) => peserta[i].lokasi),
        tempat.map((t) => t.lokasi),
        profil,
        { kunci, ambil },
      )
    } catch (galat) {
      const indeks = galat instanceof OrsGagal && galat.kode === KODE_TITIK_TIDAK_TERJANGKAU ? galat.indeksTitik : undefined
      // Di `locations`, peserta ada di depan dan tempat di belakang.
      if (indeks !== undefined && indeks >= anggota.length) throw new TempatTakTerjangkau(indeks - anggota.length)
      throw galat
    }
    anggota.forEach((i, baris) => {
      menit[i] = durasi[baris].map((d) => (d === null ? null : menitDariDetik(d)))
    })
  }
  return menit
}
