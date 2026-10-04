import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { BATAS_HITUNG_MS } from './hitung'
import { vKendaraan, vTitik } from './schema'
import { JUMLAH_KANDIDAT_AKHIR } from '../src/domain/keadilan'
import { MAKS_PESERTA, MASA_ROOM_MS, buatKodeRoom, normalisasiKode, roomPenuh, sudahKedaluwarsa } from '../src/domain/room'
import { rapikanNama } from '../src/domain/peserta'
import { samarkan, titikValid } from '../src/domain/lokasi'
import { pilihanAkhir } from '../src/domain/vote'

/** Frontend membedakan pesan dan ilustrasi galat lewat `error.data.galat` (mutation) atau `hasil.galat` (query). */
export type Galat =
  | 'ROOM_TIDAK_ADA'
  | 'ROOM_KEDALUWARSA'
  | 'ROOM_PENUH'
  | 'NAMA_TIDAK_VALID'
  | 'LOKASI_TIDAK_VALID'
  | 'PESERTA_TIDAK_DIKENAL'
  | 'LOKASI_BELUM_CUKUP'
  | 'SEDANG_MENGHITUNG'
  | 'ROOM_BELUM_SIAP'
  | 'KANDIDAT_TIDAK_ADA'
  | 'ROOM_SUDAH_TETAP'
  | 'PILIHAN_BERUBAH'

const gagal = (galat: Galat) => new ConvexError({ galat })

async function cariRoom(ctx: QueryCtx, kodeMasukan: string) {
  const kode = normalisasiKode(kodeMasukan)
  if (!kode) return null
  return await ctx.db.query('room').withIndex('by_kode', (q) => q.eq('kode', kode)).unique()
}

/** Untuk mutation. Jam boleh dibaca di sini, jadi room tetap ditolak walaupun fungsi terjadwal belum sempat jalan. */
const roomKedaluwarsa = (room: Doc<'room'>) => room.kedaluwarsa === true || sudahKedaluwarsa(room.kedaluwarsaPada, Date.now())

/** Untuk mutation yang memakai kunci peserta: pemiliknya harus cocok, dan room-nya masih hidup. */
async function pesertaDanRoom(ctx: MutationCtx, pesertaId: Id<'peserta'>, kunci: string) {
  const peserta = await ctx.db.get('peserta', pesertaId)
  if (!peserta || peserta.kunci !== kunci) throw gagal('PESERTA_TIDAK_DIKENAL')
  const room = await ctx.db.get('room', peserta.roomId)
  if (!room) throw gagal('ROOM_TIDAK_ADA')
  if (roomKedaluwarsa(room)) throw gagal('ROOM_KEDALUWARSA')
  return { peserta, room }
}

/** Kandidat room urut peringkat, masing-masing dengan pemilihnya urut waktu vote. Dipakai `lihat` dan `tetapkan`. */
async function kandidatDanPemilih(ctx: QueryCtx, roomId: Id<'room'>) {
  const kandidat = await ctx.db
    .query('kandidat')
    .withIndex('by_roomId_and_peringkat', (q) => q.eq('roomId', roomId))
    .take(JUMLAH_KANDIDAT_AKHIR)
  // Urut waktu vote, dari index. Satu orang paling banyak satu vote, jadi paling banyak 24.
  const semuaVote = await ctx.db
    .query('vote')
    .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
    .take(MAKS_PESERTA)
  return kandidat.map((k) => ({ ...k, id: k._id, pemilih: semuaVote.filter((x) => x.kandidatId === k._id).map((x) => x.pesertaId) }))
}

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

/** Room tanpa data pribadi disimpan selama ini supaya link lama menampilkan "room sudah berakhir", lalu dihapus. */
const MASA_SISA_ROOM_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Dijadwalkan tepat 24 jam setelah room dibuat (AGENTS.md §8). Semua data pribadi dihapus: nama, lokasi, kunci,
 * vote, kandidat (waktu tempuhnya dihitung dari lokasi), dan titik tengah. Yang tersisa hanya kode dan status room.
 */
export const tandaiKedaluwarsa = internalMutation({
  args: { roomId: v.id('room') },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get('room', roomId)
    if (!room) return
    const vote = await ctx.db
      .query('vote')
      .withIndex('by_roomId', (q) => q.eq('roomId', roomId))
      .take(MAKS_PESERTA)
    for (const x of vote) await ctx.db.delete('vote', x._id)
    const kandidat = await ctx.db
      .query('kandidat')
      .withIndex('by_roomId_and_peringkat', (q) => q.eq('roomId', roomId))
      .take(50)
    for (const k of kandidat) await ctx.db.delete('kandidat', k._id)
    const peserta = await ctx.db
      .query('peserta')
      .withIndex('by_roomId_and_urutanGabung', (q) => q.eq('roomId', roomId))
      .take(MAKS_PESERTA)
    for (const p of peserta) await ctx.db.delete('peserta', p._id)

    await ctx.db.patch('room', roomId, { kedaluwarsa: true, titikTengah: undefined, tetap: undefined })
    await ctx.scheduler.runAfter(MASA_SISA_ROOM_MS, internal.room.hapusRoom, { roomId })
  },
})

/** Seminggu setelah berakhir, room dihapus seluruhnya dan kodenya bisa dipakai room baru. */
export const hapusRoom = internalMutation({
  args: { roomId: v.id('room') },
  handler: async (ctx, { roomId }) => {
    if (await ctx.db.get('room', roomId)) await ctx.db.delete('room', roomId)
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
    const { room } = await pesertaDanRoom(ctx, pesertaId, kunci)
    if (!titikValid(lokasi)) throw gagal('LOKASI_TIDAK_VALID')
    await ctx.db.patch('peserta', pesertaId, { lokasi: samarkan(lokasi) })
    // Hasil yang sudah keluar jadi usang kalau ada lokasi yang berubah (Discussions #8).
    await ctx.db.patch('room', room._id, { versiLokasi: (room.versiLokasi ?? 0) + 1 })
  },
})

/** Tombol "Cari tempat". Siapa saja di room boleh menekannya setelah minimal 2 orang berbagi lokasi (Discussions #8). */
export const hitung = mutation({
  args: { pesertaId: v.id('peserta'), kunci: v.string() },
  handler: async (ctx, { pesertaId, kunci }) => {
    const { room } = await pesertaDanRoom(ctx, pesertaId, kunci)
    if (room.tetap) throw gagal('ROOM_SUDAH_TETAP')
    if (room.status === 'menghitung') throw gagal('SEDANG_MENGHITUNG')
    const peserta = await ctx.db
      .query('peserta')
      .withIndex('by_roomId_and_urutanGabung', (q) => q.eq('roomId', room._id))
      .take(MAKS_PESERTA)
    if (peserta.filter((p) => p.lokasi).length < 2) throw gagal('LOKASI_BELUM_CUKUP')
    // Hasil yang masih berlaku tidak dihitung ulang. Lokasinya sama, jadi hasilnya juga sama, sedangkan menghitung lagi
    // memakai kuota ORS dan mengosongkan vote. Layar memang hanya menawarkan hitung ulang kalau hasilnya usang.
    if (room.status === 'siap' && room.versiLokasi === room.versiHasil) return

    // Kandidat lama tetap ditampilkan sampai hasil baru menggantikannya.
    const putaran = (room.putaranHitung ?? 0) + 1
    await ctx.db.patch('room', room._id, { status: 'menghitung', galatHitung: undefined, putaranHitung: putaran })
    await ctx.scheduler.runAfter(0, internal.hitung.jalankan, { roomId: room._id, putaran })
    await ctx.scheduler.runAfter(BATAS_HITUNG_MS, internal.hitung.batasWaktu, { roomId: room._id, putaran })
  },
})

/**
 * Satu orang satu vote. `kandidatId: null` membatalkan vote. Ganti pilihan menghapus vote lama dan membuat yang baru,
 * jadi urutan `pemilih` mengikuti waktu vote terakhir, untuk animasi pin yang menumpuk di kartu tempat.
 */
export const vote = mutation({
  args: { pesertaId: v.id('peserta'), kunci: v.string(), kandidatId: v.union(v.id('kandidat'), v.null()) },
  handler: async (ctx, { pesertaId, kunci, kandidatId }) => {
    const { room } = await pesertaDanRoom(ctx, pesertaId, kunci)
    if (room.tetap) throw gagal('ROOM_SUDAH_TETAP')
    // Selama hitung ulang, kandidatnya akan berganti dan vote dikosongkan, jadi vote baru ditolak.
    if (room.status !== 'siap') throw gagal('ROOM_BELUM_SIAP')
    if (kandidatId) {
      const kandidat = await ctx.db.get('kandidat', kandidatId)
      if (!kandidat || kandidat.roomId !== room._id) throw gagal('KANDIDAT_TIDAK_ADA')
    }

    const lama = await ctx.db
      .query('vote')
      .withIndex('by_pesertaId', (q) => q.eq('pesertaId', pesertaId))
      .unique()
    if (lama?.kandidatId === kandidatId) return
    if (lama) await ctx.db.delete('vote', lama._id)
    if (kandidatId) await ctx.db.insert('vote', { roomId: room._id, pesertaId, kandidatId })
  },
})

/**
 * Menetapkan tempat untuk semua orang (Discussions #42). Siapa saja di room boleh, tapi hanya untuk suara terbanyak
 * saat ini, dihitung dengan `pilihanAkhir` yang sama dengan kartu hasil. Selama tetap, vote dan hitung ditolak.
 */
export const tetapkan = mutation({
  args: { pesertaId: v.id('peserta'), kunci: v.string(), kandidatId: v.id('kandidat') },
  handler: async (ctx, { pesertaId, kunci, kandidatId }) => {
    const { room } = await pesertaDanRoom(ctx, pesertaId, kunci)
    if (room.tetap) {
      // Ketukan ganda atau percobaan ulang untuk tempat yang sama bukan galat.
      if (room.tetap.kandidatId === kandidatId) return
      throw gagal('ROOM_SUDAH_TETAP')
    }
    if (room.status !== 'siap') throw gagal('ROOM_BELUM_SIAP')
    const kandidat = await ctx.db.get('kandidat', kandidatId)
    if (!kandidat || kandidat.roomId !== room._id) throw gagal('KANDIDAT_TIDAK_ADA')
    // Suara bisa berubah selama dialog konfirmasi terbuka, jadi dihitung ulang di transaksi ini.
    if (pilihanAkhir(await kandidatDanPemilih(ctx, room._id)) !== kandidatId) throw gagal('PILIHAN_BERUBAH')
    await ctx.db.patch('room', room._id, { tetap: { kandidatId, olehPesertaId: pesertaId, pada: Date.now() } })
  },
})

/** Membuka voting lagi kalau rencananya berubah. Vote yang sudah ada tetap disimpan. */
export const bukaLagi = mutation({
  args: { pesertaId: v.id('peserta'), kunci: v.string() },
  handler: async (ctx, { pesertaId, kunci }) => {
    const { room } = await pesertaDanRoom(ctx, pesertaId, kunci)
    if (room.tetap) await ctx.db.patch('room', room._id, { tetap: undefined })
  },
})

/**
 * Keluar room: nama, lokasi, dan vote orang itu dihapus (Discussions #8). `urutanGabung`-nya tidak dipakai ulang,
 * jadi warna pin orang lain tidak berubah. Sampai dihitung ulang, `kandidat[].waktuTempuh` masih bisa memuat
 * `pesertaId` yang sudah keluar.
 */
export const keluar = mutation({
  args: { pesertaId: v.id('peserta'), kunci: v.string() },
  handler: async (ctx, { pesertaId, kunci }) => {
    const { peserta, room } = await pesertaDanRoom(ctx, pesertaId, kunci)
    const voteSaya = await ctx.db
      .query('vote')
      .withIndex('by_pesertaId', (q) => q.eq('pesertaId', pesertaId))
      .unique()
    if (voteSaya) await ctx.db.delete('vote', voteSaya._id)
    await ctx.db.delete('peserta', pesertaId)
    // Orang yang ikut dihitung keluar, jadi hasil yang sudah keluar jadi usang.
    if (peserta.lokasi) await ctx.db.patch('room', room._id, { versiLokasi: (room.versiLokasi ?? 0) + 1 })
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
    const kandidat = await kandidatDanPemilih(ctx, room._id)
    return {
      ok: true as const,
      room: {
        kode: room.kode,
        status: room.status,
        kedaluwarsaPada: room.kedaluwarsaPada,
        titikTengah: room.titikTengah ?? null,
        galatHitung: room.galatHitung ?? null,
        hasilPada: room.hasilPada ?? null,
        hasilUsang: room.hasilPada !== undefined && (room.versiLokasi ?? 0) !== (room.versiHasil ?? 0),
        tetap: room.tetap ?? null,
      },
      peserta: peserta.map((p) => ({
        id: p._id,
        nama: p.nama,
        kendaraan: p.kendaraan,
        urutanGabung: p.urutanGabung,
        lokasi: p.lokasi ?? null,
      })),
      // Urut peringkat, langsung dari index.
      kandidat: kandidat.map((k) => ({
        id: k.id,
        nama: k.nama,
        kategori: k.kategori,
        lokasi: k.lokasi,
        alamat: k.alamat ?? null,
        jarakDariTengahMeter: k.jarakDariTengahMeter,
        waktuTempuh: k.waktuTempuh,
        terlamaMenit: k.terlamaMenit,
        selisihMenit: k.selisihMenit,
        peringkat: k.peringkat,
        pemilih: k.pemilih,
      })),
    }
  },
})
