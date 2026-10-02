import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { vKendaraan, vTitik } from './schema'
import { MAKS_PESERTA, MASA_ROOM_MS, buatKodeRoom, normalisasiKode, roomPenuh, sudahKedaluwarsa } from '../src/domain/room'
import { rapikanNama } from '../src/domain/peserta'
import { samarkan, titikValid } from '../src/domain/lokasi'

/** Frontend membedakan pesan dan ilustrasi galat lewat `error.data.galat` (mutation) atau `hasil.galat` (query). */
export type Galat =
  | 'ROOM_TIDAK_ADA'
  | 'ROOM_KEDALUWARSA'
  | 'ROOM_PENUH'
  | 'NAMA_TIDAK_VALID'
  | 'LOKASI_TIDAK_VALID'
  | 'PESERTA_TIDAK_DIKENAL'

const gagal = (galat: Galat) => new ConvexError({ galat })

async function cariRoom(ctx: QueryCtx, kodeMasukan: string) {
  const kode = normalisasiKode(kodeMasukan)
  if (!kode) return null
  return await ctx.db.query('room').withIndex('by_kode', (q) => q.eq('kode', kode)).unique()
}

/** Untuk mutation. Jam boleh dibaca di sini, jadi room tetap ditolak walaupun fungsi terjadwal belum sempat jalan. */
const roomKedaluwarsa = (room: Doc<'room'>) => room.kedaluwarsa === true || sudahKedaluwarsa(room.kedaluwarsaPada, Date.now())

/** Dipakai `buat` dan `gabung`, jadi pembuat room dan teman yang gabung mendapat aturan yang sama. */
async function tambahPeserta(
  ctx: MutationCtx,
  room: Pick<Doc<'room'>, '_id' | 'jumlahGabung'>,
  nama: string,
  kendaraan: Doc<'peserta'>['kendaraan'],
) {
  // Penghitung dan peserta baru ditulis di transaksi yang sama, jadi dua orang yang gabung bersamaan tidak dapat nomor kembar.
  const urutanGabung = room.jumlahGabung + 1
  await ctx.db.patch('room', room._id, { jumlahGabung: urutanGabung })
  const kunci = crypto.randomUUID()
  const pesertaId = await ctx.db.insert('peserta', { roomId: room._id, nama, kendaraan, urutanGabung, kunci })
  return { pesertaId, kunci, urutanGabung }
}

/** Membuat room sekaligus menggabungkan pembuatnya sebagai orang ke-1, jadi tidak ada room kosong yang tertinggal. */
export const buat = mutation({
  args: { nama: v.string(), kendaraan: vKendaraan },
  handler: async (ctx, args) => {
    const nama = rapikanNama(args.nama)
    if (!nama) throw gagal('NAMA_TIDAK_VALID')

    // Peluang bentrok sangat kecil (31^6 kode), tapi tetap dicek karena kode harus unik selama room hidup.
    for (let percobaan = 0; percobaan < 5; percobaan++) {
      const kode = buatKodeRoom(Math.random)
      if (await cariRoom(ctx, kode)) continue
      const kedaluwarsaPada = Date.now() + MASA_ROOM_MS
      const roomId = await ctx.db.insert('room', { kode, status: 'menunggu_peserta', kedaluwarsaPada, jumlahGabung: 0 })
      await ctx.scheduler.runAt(kedaluwarsaPada, internal.room.tandaiKedaluwarsa, { roomId })
      return { kode, ...(await tambahPeserta(ctx, { _id: roomId, jumlahGabung: 0 }, nama, args.kendaraan)) }
    }
    throw new Error('Gagal membuat kode room yang unik')
  },
})

/** Dijadwalkan saat room dibuat. Item Privasi di #1 nanti juga menghapus data peserta dari sini. */
export const tandaiKedaluwarsa = internalMutation({
  args: { roomId: v.id('room') },
  handler: async (ctx, { roomId }) => {
    if (await ctx.db.get('room', roomId)) await ctx.db.patch('room', roomId, { kedaluwarsa: true })
  },
})

export const gabung = mutation({
  args: { kode: v.string(), nama: v.string(), kendaraan: vKendaraan },
  handler: async (ctx, args) => {
    const room = await cariRoom(ctx, args.kode)
    if (!room) throw gagal('ROOM_TIDAK_ADA')
    if (roomKedaluwarsa(room)) throw gagal('ROOM_KEDALUWARSA')
    if (roomPenuh(room.jumlahGabung)) throw gagal('ROOM_PENUH')
    const nama = rapikanNama(args.nama)
    if (!nama) throw gagal('NAMA_TIDAK_VALID')
    return await tambahPeserta(ctx, room, nama, args.kendaraan)
  },
})

export const kirimLokasi = mutation({
  args: { pesertaId: v.id('peserta'), kunci: v.string(), lokasi: vTitik },
  handler: async (ctx, { pesertaId, kunci, lokasi }) => {
    const peserta = await ctx.db.get('peserta', pesertaId)
    if (!peserta || peserta.kunci !== kunci) throw gagal('PESERTA_TIDAK_DIKENAL')
    const room = await ctx.db.get('room', peserta.roomId)
    if (!room) throw gagal('ROOM_TIDAK_ADA')
    if (roomKedaluwarsa(room)) throw gagal('ROOM_KEDALUWARSA')
    if (!titikValid(lokasi)) throw gagal('LOKASI_TIDAK_VALID')
    await ctx.db.patch('peserta', pesertaId, { lokasi: samarkan(lokasi) })
  },
})

/** Satu query realtime untuk satu room. Kunci peserta tidak pernah ikut dikirim. */
export const lihat = query({
  args: { kode: v.string() },
  handler: async (ctx, args) => {
    const room = await cariRoom(ctx, args.kode)
    if (!room) return { ok: false as const, galat: 'ROOM_TIDAK_ADA' as const }
    // Query tidak boleh membaca jam (convex/_generated/ai/guidelines.md), jadi yang dibaca tanda dari tandaiKedaluwarsa.
    if (room.kedaluwarsa) return { ok: false as const, galat: 'ROOM_KEDALUWARSA' as const }

    const peserta = await ctx.db
      .query('peserta')
      .withIndex('by_roomId_and_urutanGabung', (q) => q.eq('roomId', room._id))
      .take(MAKS_PESERTA)
    return {
      ok: true as const,
      room: {
        kode: room.kode,
        status: room.status,
        kedaluwarsaPada: room.kedaluwarsaPada,
        titikTengah: room.titikTengah ?? null,
      },
      peserta: peserta.map((p) => ({
        id: p._id,
        nama: p.nama,
        kendaraan: p.kendaraan,
        urutanGabung: p.urutanGabung,
        lokasi: p.lokasi ?? null,
      })),
    }
  },
})
