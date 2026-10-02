import { ConvexError, v } from 'convex/values'
import { mutation, query, type QueryCtx } from './_generated/server'
import { vKendaraan, vTitik } from './schema'
import { MASA_ROOM_MS, buatKodeRoom, normalisasiKode, roomPenuh, sudahKedaluwarsa } from '../src/domain/room'
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

export const buat = mutation({
  args: {},
  handler: async (ctx) => {
    // Peluang bentrok sangat kecil (31^6 kode), tapi tetap dicek karena kode harus unik selama room hidup.
    for (let percobaan = 0; percobaan < 5; percobaan++) {
      const kode = buatKodeRoom(Math.random)
      if (await cariRoom(ctx, kode)) continue
      await ctx.db.insert('room', {
        kode,
        status: 'menunggu_peserta',
        kedaluwarsaPada: Date.now() + MASA_ROOM_MS,
        jumlahGabung: 0,
      })
      return { kode }
    }
    throw new Error('Gagal membuat kode room yang unik')
  },
})

export const gabung = mutation({
  args: { kode: v.string(), nama: v.string(), kendaraan: vKendaraan },
  handler: async (ctx, args) => {
    const room = await cariRoom(ctx, args.kode)
    if (!room) throw gagal('ROOM_TIDAK_ADA')
    if (sudahKedaluwarsa(room.kedaluwarsaPada, Date.now())) throw gagal('ROOM_KEDALUWARSA')
    if (roomPenuh(room.jumlahGabung)) throw gagal('ROOM_PENUH')
    const nama = rapikanNama(args.nama)
    if (!nama) throw gagal('NAMA_TIDAK_VALID')

    // Penghitung dan peserta baru ditulis di transaksi yang sama, jadi dua orang yang gabung bersamaan tidak dapat nomor kembar.
    const urutanGabung = room.jumlahGabung + 1
    await ctx.db.patch('room', room._id, { jumlahGabung: urutanGabung })
    const kunci = crypto.randomUUID()
    const pesertaId = await ctx.db.insert('peserta', {
      roomId: room._id,
      nama,
      kendaraan: args.kendaraan,
      urutanGabung,
      kunci,
    })
    return { pesertaId, kunci, urutanGabung }
  },
})

export const kirimLokasi = mutation({
  args: { pesertaId: v.id('peserta'), kunci: v.string(), lokasi: vTitik },
  handler: async (ctx, { pesertaId, kunci, lokasi }) => {
    const peserta = await ctx.db.get('peserta', pesertaId)
    if (!peserta || peserta.kunci !== kunci) throw gagal('PESERTA_TIDAK_DIKENAL')
    const room = await ctx.db.get('room', peserta.roomId)
    if (!room) throw gagal('ROOM_TIDAK_ADA')
    if (sudahKedaluwarsa(room.kedaluwarsaPada, Date.now())) throw gagal('ROOM_KEDALUWARSA')
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
    if (sudahKedaluwarsa(room.kedaluwarsaPada, Date.now())) return { ok: false as const, galat: 'ROOM_KEDALUWARSA' as const }

    const peserta = await ctx.db
      .query('peserta')
      .withIndex('by_room', (q) => q.eq('roomId', room._id))
      .collect()
    return {
      ok: true as const,
      room: {
        kode: room.kode,
        status: room.status,
        kedaluwarsaPada: room.kedaluwarsaPada,
        titikTengah: room.titikTengah ?? null,
      },
      peserta: peserta
        .toSorted((a, b) => a.urutanGabung - b.urutanGabung)
        .map((p) => ({
          id: p._id,
          nama: p.nama,
          kendaraan: p.kendaraan,
          urutanGabung: p.urutanGabung,
          lokasi: p.lokasi ?? null,
        })),
    }
  },
})
