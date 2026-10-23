import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { env, internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { catatKalauSibuk, giliranTransitous } from './batasLaju'
import { vRingkasanRute } from './schema'
import { rencanaPerjalanan } from './transitous'
import type { Titik } from '../src/domain/lokasi'
import { ringkasRute } from '../src/domain/ringkasanRute'
import { MAKS_PESERTA } from '../src/domain/room'
import { berangkatTransportasiUmum } from '../src/domain/transportasiUmum'

/**
 * Kalau ringkasan belum selesai setelah ini, statusnya jadi `gagal` supaya layar bisa menawarkan Coba lagi. Room yang semua
 * orangnya naik transportasi umum butuh sekitar satu menit, karena antrean Transitous berlaku untuk seluruh app.
 */
const BATAS_RINGKASAN_MS = 3 * 60_000

const vTarget = v.array(v.object({ pesertaId: v.id('peserta'), putaran: v.number() }))
type Ringkasan = Infer<typeof vRingkasanRute>
type Bahan = { asal: Titik; tujuan: Titik; jamKetemuan: number | null }

export const barisRingkasan = (ctx: QueryCtx, pesertaId: Id<'peserta'>) =>
  ctx.db
    .query('ringkasanRute')
    .withIndex('by_pesertaId', (q) => q.eq('pesertaId', pesertaId))
    .unique()

/**
 * Menyesuaikan ringkasan rute orang-orang ini dengan keadaannya sekarang, selama tempat sudah ditetapkan (Discussions #83).
 * Yang naik transportasi umum dan sudah berbagi lokasi dihitung (ulang), dan ringkasan milik orang lain dihapus.
 */
export async function perbaruiRingkasan(ctx: MutationCtx, roomId: Id<'room'>, peserta: readonly Doc<'peserta'>[]) {
  const target: Infer<typeof vTarget> = []
  for (const p of peserta) {
    const lama = await barisRingkasan(ctx, p._id)
    if (p.kendaraan !== 'transportasi_umum' || !p.lokasi) {
      if (lama) await ctx.db.delete('ringkasanRute', lama._id)
      continue
    }
    const putaran = (lama?.putaran ?? 0) + 1
    const ringkasan: Ringkasan = { status: 'menghitung' }
    if (lama) await ctx.db.patch('ringkasanRute', lama._id, { putaran, ringkasan })
    else await ctx.db.insert('ringkasanRute', { roomId, pesertaId: p._id, putaran, ringkasan })
    target.push({ pesertaId: p._id, putaran })
  }
  if (target.length === 0) return
  await ctx.scheduler.runAfter(0, internal.ringkasanRute.jalankan, { target })
  await ctx.scheduler.runAfter(BATAS_RINGKASAN_MS, internal.ringkasanRute.batasWaktu, { target })
}

/** Saat tempat dibuka lagi atau room berakhir, semua ringkasan di room itu dihapus. */
export async function hapusRingkasanRoom(ctx: MutationCtx, roomId: Id<'room'>) {
  const semua = await ctx.db
    .query('ringkasanRute')
    .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
    .take(MAKS_PESERTA)
  for (const r of semua) await ctx.db.delete('ringkasanRute', r._id)
}

/** Lokasi orang itu, tempat yang ditetapkan, dan jam ketemuan, kalau ringkasannya masih perlu dihitung untuk putaran ini. */
export const bahan = internalQuery({
  args: { pesertaId: v.id('peserta'), putaran: v.number() },
  handler: async (ctx, { pesertaId, putaran }): Promise<Bahan | null> => {
    const baris = await barisRingkasan(ctx, pesertaId)
    if (!baris || baris.putaran !== putaran || baris.ringkasan.status !== 'menghitung') return null
    const room = await ctx.db.get('room', baris.roomId)
    const peserta = await ctx.db.get('peserta', pesertaId)
    if (!room?.tetap || room.kedaluwarsa || !peserta?.lokasi) return null
    const tempat = await ctx.db.get('kandidat', room.tetap.kandidatId)
    if (!tempat) return null
    return { asal: peserta.lokasi, tujuan: tempat.lokasi, jamKetemuan: room.jamKetemuan?.waktu ?? null }
  },
})

/** Hasil dari putaran yang sudah lewat, misalnya sebelum jam ketemuan diubah, diabaikan. */
export const simpan = internalMutation({
  args: { pesertaId: v.id('peserta'), putaran: v.number(), ringkasan: vRingkasanRute },
  handler: async (ctx, { pesertaId, putaran, ringkasan }) => {
    const baris = await barisRingkasan(ctx, pesertaId)
    if (baris?.putaran === putaran) await ctx.db.patch('ringkasanRute', baris._id, { ringkasan })
  },
})

/** Dijadwalkan bersama `jalankan`. Kalau hitungnya tergantung, ringkasannya tidak tertahan di `menghitung` selamanya. */
export const batasWaktu = internalMutation({
  args: { target: vTarget },
  handler: async (ctx, { target }) => {
    for (const { pesertaId, putaran } of target) {
      const baris = await barisRingkasan(ctx, pesertaId)
      if (baris?.putaran === putaran && baris.ringkasan.status === 'menghitung') {
        await ctx.db.patch('ringkasanRute', baris._id, { ringkasan: { status: 'gagal' } })
      }
    }
  },
})

export const jalankan = internalAction({
  args: { target: vTarget },
  handler: async (ctx, { target }) => {
    // Satu per satu, supaya room besar tidak memenuhi antrean Transitous untuk seluruh app sekaligus.
    for (const { pesertaId, putaran } of target) {
      const data: Bahan | null = await ctx.runQuery(internal.ringkasanRute.bahan, { pesertaId, putaran })
      if (!data) continue
      let ringkasan: Ringkasan
      try {
        ringkasan = await hitungRingkasan(data, {
          urlTransitous: env.TRANSITOUS_URL,
          // Batas laju hanya untuk Transitous asli, sama seperti Cari tempat.
          antre: env.TRANSITOUS_URL ? undefined : () => giliranTransitous(ctx),
        })
      } catch (galat) {
        // Pesan galat Transitous sengaja tidak memuat koordinat, jadi aman ditulis ke log (AGENTS.md §8).
        console.error(`Ringkasan rute gagal: ${galat instanceof Error ? galat.message : 'galat tidak dikenal'}`)
        await catatKalauSibuk(ctx, galat)
        ringkasan = { status: 'gagal' }
      }
      await ctx.runMutation(internal.ringkasanRute.simpan, { pesertaId, putaran, ringkasan })
    }
  },
})

type OpsiRingkasan = {
  ambil?: typeof fetch
  /** Kosong berarti server asli. Diisi dari env `TRANSITOUS_URL`, misalnya oleh E2E. */
  urlTransitous?: string
  antre?: () => Promise<void>
  sekarang?: number
}

/**
 * Ringkasan rute satu orang (Discussions #83). Dengan jam ketemuan, Transitous ditanya rute yang sampai paling lambat jam itu.
 * Tanpa jam ketemuan, rute yang berangkat sekarang. Di akhir pekan dihitung dengan jadwal hari kerja seperti Cari tempat,
 * lalu jamnya dikembalikan ke hari aslinya.
 */
export async function hitungRingkasan(
  { asal, tujuan, jamKetemuan }: Bahan,
  { ambil, urlTransitous, antre, sekarang = Date.now() }: OpsiRingkasan,
): Promise<Ringkasan> {
  const acuan = jamKetemuan ?? sekarang
  const waktu = berangkatTransportasiUmum(acuan)
  const pilihan = await rencanaPerjalanan(asal, tujuan, { urlDasar: urlTransitous, ambil, antre, waktu, tiba: jamKetemuan !== null })
  return ringkasRute(pilihan, { jamKetemuan, dihitungPada: sekarang, geserMs: waktu - acuan })
}
