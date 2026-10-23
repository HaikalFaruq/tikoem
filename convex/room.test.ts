// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { MASA_ROOM_MS } from '../src/domain/room'

// Pola `!(*.*.*)` dari dokumentasi convex-test tidak didukung glob Vite 8, jadi pakai daftar pola dengan pengecualian.
const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts'])
const siapkan = () => convexTest(schema, modules)
type Tes = ReturnType<typeof siapkan>

/** Kode galat dari mutation yang ditolak, atau `null` kalau ternyata berhasil. */
const galatDari = (janji: Promise<unknown>) =>
  janji.then(
    () => null,
    (e: unknown) => (e instanceof ConvexError ? (e.data as { galat: string }).galat : String(e)),
  )

/** Room baru dengan Haikal sebagai pembuat, yaitu orang ke-1. */
const roomBaru = (t: Tes) => t.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })

/** Room berisi Haikal dan Bintang yang hasilnya sudah keluar dengan dua kandidat. */
async function roomSiap(t: Tes) {
  const haikal = await roomBaru(t)
  const bintang = await t.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  const kandidat = await t.run(async (ctx) => {
    const room = await ctx.db
      .query('room')
      .withIndex('by_kode', (q) => q.eq('kode', haikal.kode))
      .unique()
    await ctx.db.patch('room', room!._id, { status: 'siap', hasilPada: Date.now() })
    const id = []
    for (const [i, nama] of ['Kafe A', 'Resto B'].entries()) {
      id.push(
        await ctx.db.insert('kandidat', {
          roomId: room!._id,
          osmId: `node/${i}`,
          nama,
          kategori: 'kafe',
          lokasi: { lat: -6.2, lng: 106.8 },
          jarakDariTengahMeter: 100,
          waktuTempuh: [],
          terlamaMenit: 10 + i,
          selisihMenit: 0,
          peringkat: i + 1,
        }),
      )
    }
    return id
  })
  return { haikal, bintang, kandidat }
}

/** `pemilih` tiap kandidat, urut peringkat. */
async function pemilih(t: Tes, kode: string) {
  const hasil = await t.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil.kandidat.map((k) => k.pemilih)
}

describe('room lewat link', () => {
  it('membuat room dan langsung menggabungkan pembuatnya sebagai orang ke-1', async () => {
    const t = siapkan()
    const pembuat = await roomBaru(t)
    expect(pembuat.kode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
    expect(pembuat.urutanGabung).toBe(1)

    const hasil = await t.query(api.room.lihat, { kode: pembuat.kode.toLowerCase() })
    expect(hasil).toMatchObject({
      ok: true,
      room: { kode: pembuat.kode, status: 'menunggu_peserta', titikTengah: null },
      peserta: [{ id: pembuat.pesertaId, nama: 'Haikal', kendaraan: 'motor', urutanGabung: 1, lokasi: null }],
    })
  })

  it('memberi urutan gabung berikutnya dan mengurutkan peserta', async () => {
    const t = siapkan()
    const { kode } = await roomBaru(t)
    await t.mutation(api.room.gabung, { kode, nama: '  Bintang ', kendaraan: 'mobil' })
    await t.mutation(api.room.gabung, { kode, nama: 'Umar', kendaraan: 'jalan_kaki' })

    const hasil = await t.query(api.room.lihat, { kode })
    if (!hasil.ok) throw new Error(hasil.galat)
    expect(hasil.peserta.map((p) => [p.urutanGabung, p.nama, p.kendaraan])).toEqual([
      [1, 'Haikal', 'motor'],
      [2, 'Bintang', 'mobil'],
      [3, 'Umar', 'jalan_kaki'],
    ])
  })

  it('tidak memberi nomor kembar ke dua orang yang gabung bersamaan', async () => {
    const t = siapkan()
    const { kode } = await roomBaru(t)
    const [a, b] = await Promise.all([
      t.mutation(api.room.gabung, { kode, nama: 'A', kendaraan: 'motor' }),
      t.mutation(api.room.gabung, { kode, nama: 'B', kendaraan: 'motor' }),
    ])
    expect([a.urutanGabung, b.urutanGabung].toSorted((x, y) => x - y)).toEqual([2, 3])
  })

  it('menolak orang ke-25 dengan ROOM_PENUH, termasuk pembuat room dalam hitungan', async () => {
    const t = siapkan()
    const { kode } = await roomBaru(t)
    for (let i = 2; i <= 24; i++) await t.mutation(api.room.gabung, { kode, nama: `Teman ${i}`, kendaraan: 'motor' })
    expect(await galatDari(t.mutation(api.room.gabung, { kode, nama: 'Teman 25', kendaraan: 'motor' }))).toBe('ROOM_PENUH')
  })

  it('menolak room yang tidak ada, kedaluwarsa, atau nama yang kosong', async () => {
    const t = siapkan()
    expect(await galatDari(t.mutation(api.room.gabung, { kode: 'ZZZZZZ', nama: 'A', kendaraan: 'motor' }))).toBe('ROOM_TIDAK_ADA')
    expect(await galatDari(t.mutation(api.room.gabung, { kode: 'bukan kode', nama: 'A', kendaraan: 'motor' }))).toBe('ROOM_TIDAK_ADA')
    expect(await t.query(api.room.lihat, { kode: 'ZZZZZZ' })).toEqual({ ok: false, galat: 'ROOM_TIDAK_ADA' })

    expect(await galatDari(t.mutation(api.room.buat, { nama: '   ', kendaraan: 'motor' }))).toBe('NAMA_TIDAK_VALID')
    const { kode } = await roomBaru(t)
    expect(await galatDari(t.mutation(api.room.gabung, { kode, nama: '   ', kendaraan: 'motor' }))).toBe('NAMA_TIDAK_VALID')

    // Mutation membaca jam sendiri, jadi tetap menolak walaupun fungsi terjadwal belum sempat memasang tanda.
    await t.run(async (ctx) => {
      await ctx.db.insert('room', { kode: 'ABCDEF', status: 'menunggu_peserta', kedaluwarsaPada: Date.now() - 1, jumlahGabung: 0 })
    })
    expect(await galatDari(t.mutation(api.room.gabung, { kode: 'ABCDEF', nama: 'A', kendaraan: 'motor' }))).toBe('ROOM_KEDALUWARSA')
  })

  it('tepat 24 jam setelah dibuat, room berakhir dan semua data pribadinya dihapus', async () => {
    vi.useFakeTimers()
    try {
      const t = siapkan()
      const { haikal, bintang, kandidat } = await roomSiap(t)
      const { kode } = haikal
      await t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.26, lng: 106.81 } })
      await t.mutation(api.room.vote, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[0] })
      await t.run(async (ctx) => {
        const room = (await ctx.db.query('room').first())!
        await ctx.db.patch('room', room._id, { titikTengah: { lat: -6.24, lng: 106.83 } })
      })

      vi.advanceTimersByTime(MASA_ROOM_MS - 1000)
      await t.finishInProgressScheduledFunctions()
      expect((await t.query(api.room.lihat, { kode })).ok).toBe(true)

      vi.advanceTimersByTime(1000)
      await t.finishInProgressScheduledFunctions()
      expect(await t.query(api.room.lihat, { kode })).toEqual({ ok: false, galat: 'ROOM_KEDALUWARSA' })
      expect(await galatDari(t.mutation(api.room.gabung, { kode, nama: 'Telat', kendaraan: 'motor' }))).toBe('ROOM_KEDALUWARSA')

      // Nama, lokasi, kunci, vote, kandidat, dan titik tengah sudah tidak ada di database.
      const sisa = await t.run(async (ctx) => ({
        peserta: await ctx.db.query('peserta').collect(),
        vote: await ctx.db.query('vote').collect(),
        kandidat: await ctx.db.query('kandidat').collect(),
        room: await ctx.db.query('room').collect(),
      }))
      expect(sisa.peserta).toEqual([])
      expect(sisa.vote).toEqual([])
      expect(sisa.kandidat).toEqual([])
      expect(sisa.room).toHaveLength(1)
      expect(sisa.room[0]).toMatchObject({ kode, kedaluwarsa: true })
      expect(sisa.room[0].titikTengah).toBeUndefined()
      // Kunci lama tidak lagi dikenali, karena pesertanya sudah dihapus.
      expect(
        await galatDari(t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.2, lng: 106.8 } })),
      ).toBe('PESERTA_TIDAK_DIKENAL')

      // Seminggu kemudian room dihapus seluruhnya.
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000)
      await t.finishInProgressScheduledFunctions()
      expect(await t.query(api.room.lihat, { kode })).toEqual({ ok: false, galat: 'ROOM_TIDAK_ADA' })
      expect(await t.run((ctx) => ctx.db.query('room').collect())).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('menyimpan lokasi yang sudah disamarkan dan hanya menerima kunci pemiliknya', async () => {
    const t = siapkan()
    const { kode } = await roomBaru(t)
    const bintang = await t.mutation(api.room.gabung, { kode, nama: 'Bintang', kendaraan: 'mobil' })
    const lokasi = { lat: -6.2087634, lng: 106.8455991 }

    expect(await galatDari(t.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: 'tebakan', lokasi }))).toBe(
      'PESERTA_TIDAK_DIKENAL',
    )
    expect(
      await galatDari(
        t.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: 120, lng: 0 } }),
      ),
    ).toBe('LOKASI_TIDAK_VALID')

    await t.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi })
    const hasil = await t.query(api.room.lihat, { kode })
    if (!hasil.ok) throw new Error(hasil.galat)
    expect(hasil.peserta.map((p) => p.lokasi)).toEqual([null, { lat: -6.209, lng: 106.846 }])
  })

  it('room baru belum punya hasil hitung', async () => {
    const t = siapkan()
    const { kode } = await roomBaru(t)
    expect(await t.query(api.room.lihat, { kode })).toMatchObject({
      room: { status: 'menunggu_peserta', galatHitung: null, pesertaTidakTerjangkau: null, hasilPada: null, hasilUsang: false, putaranHitung: 0 },
      kandidat: [],
    })
  })

  it('tombol Cari tempat butuh minimal 2 orang yang berbagi lokasi dan kunci yang benar', async () => {
    // Jam palsu supaya action hitung yang dijadwalkan tidak jalan sendiri di latar.
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const t = siapkan()
    const haikal = await roomBaru(t)
    const bintang = await t.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
    await t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.26, lng: 106.81 } })

    expect(await galatDari(t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci }))).toBe('LOKASI_BELUM_CUKUP')
    await t.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: -6.22, lng: 106.85 } })
    expect(await galatDari(t.mutation(api.room.hitung, { pesertaId: bintang.pesertaId, kunci: 'tebakan' }))).toBe('PESERTA_TIDAK_DIKENAL')
    expect(await galatDari(t.mutation(api.room.hitung, { pesertaId: bintang.pesertaId, kunci: bintang.kunci }))).toBeNull()
    // Semua HP melihat putaran baru, termasuk yang terlambat menerima status menghitung (pop up traktir).
    expect(await t.query(api.room.lihat, { kode: haikal.kode })).toMatchObject({ room: { status: 'menghitung', putaranHitung: 1 } })
  })

  it('vote ditolak sebelum hasil keluar', async () => {
    const t = siapkan()
    const haikal = await roomBaru(t)
    expect(await galatDari(t.mutation(api.room.vote, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: null }))).toBe(
      'ROOM_BELUM_SIAP',
    )
  })

  it('satu orang satu vote: ganti pilihan memindahkan pin, null membatalkan, dan urutannya mengikuti waktu vote', async () => {
    const t = siapkan()
    const { haikal, bintang, kandidat } = await roomSiap(t)
    const [a, b] = kandidat
    const vote = (p: { pesertaId: Id<'peserta'>; kunci: string }, kandidatId: Id<'kandidat'> | null) =>
      t.mutation(api.room.vote, { pesertaId: p.pesertaId, kunci: p.kunci, kandidatId })

    await vote(haikal, a)
    await vote(bintang, a)
    expect(await pemilih(t, haikal.kode)).toEqual([[haikal.pesertaId, bintang.pesertaId], []])

    await vote(haikal, b)
    expect(await pemilih(t, haikal.kode)).toEqual([[bintang.pesertaId], [haikal.pesertaId]])

    // Kembali ke A: sekarang Haikal yang paling akhir vote.
    await vote(haikal, a)
    expect(await pemilih(t, haikal.kode)).toEqual([[bintang.pesertaId, haikal.pesertaId], []])

    await vote(haikal, null)
    await vote(haikal, null)
    expect(await pemilih(t, haikal.kode)).toEqual([[bintang.pesertaId], []])
  })

  it('vote ke kandidat room lain atau dengan kunci yang salah ditolak', async () => {
    const t = siapkan()
    const satu = await roomSiap(t)
    const dua = await roomSiap(t)
    expect(
      await galatDari(t.mutation(api.room.vote, { pesertaId: satu.haikal.pesertaId, kunci: satu.haikal.kunci, kandidatId: dua.kandidat[0] })),
    ).toBe('KANDIDAT_TIDAK_ADA')
    expect(
      await galatDari(t.mutation(api.room.vote, { pesertaId: satu.haikal.pesertaId, kunci: 'tebakan', kandidatId: satu.kandidat[0] })),
    ).toBe('PESERTA_TIDAK_DIKENAL')
  })

  it('keluar room menghapus nama, lokasi, dan vote, tanpa memakai ulang urutan gabung', async () => {
    const t = siapkan()
    const { haikal, bintang, kandidat } = await roomSiap(t)
    await t.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: -6.22, lng: 106.85 } })
    await t.run(async (ctx) => {
      // Hasil dianggap sudah memperhitungkan lokasi Bintang.
      const room = (await ctx.db.query('room').first())!
      await ctx.db.patch('room', room._id, { versiHasil: room.versiLokasi })
    })
    await t.mutation(api.room.vote, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[0] })

    await t.mutation(api.room.keluar, { pesertaId: bintang.pesertaId, kunci: bintang.kunci })
    const hasil = await t.query(api.room.lihat, { kode: haikal.kode })
    if (!hasil.ok) throw new Error(hasil.galat)
    expect(hasil.peserta.map((p) => p.nama)).toEqual(['Haikal'])
    expect(hasil.kandidat.map((k) => k.pemilih)).toEqual([[], []])
    expect(hasil.room.hasilUsang).toBe(true)
    expect(await t.run((ctx) => ctx.db.get('peserta', bintang.pesertaId))).toBeNull()

    // Kunci lama tidak bisa dipakai lagi, dan orang berikutnya mendapat nomor baru.
    expect(await galatDari(t.mutation(api.room.keluar, { pesertaId: bintang.pesertaId, kunci: bintang.kunci }))).toBe(
      'PESERTA_TIDAK_DIKENAL',
    )
    const umar = await t.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
    expect(umar.urutanGabung).toBe(3)
  })

  it('keluar sebelum berbagi lokasi tidak membuat hasil usang, dan kunci yang salah ditolak', async () => {
    const t = siapkan()
    const { haikal, bintang } = await roomSiap(t)
    expect(await galatDari(t.mutation(api.room.keluar, { pesertaId: bintang.pesertaId, kunci: 'tebakan' }))).toBe('PESERTA_TIDAK_DIKENAL')
    await t.mutation(api.room.keluar, { pesertaId: bintang.pesertaId, kunci: bintang.kunci })
    expect(await t.query(api.room.lihat, { kode: haikal.kode })).toMatchObject({ room: { hasilUsang: false } })
  })

  it('tidak pernah mengirim kunci peserta lewat query', async () => {
    const t = siapkan()
    const pembuat = await roomBaru(t)
    const teman = await t.mutation(api.room.gabung, { kode: pembuat.kode, nama: 'Bintang', kendaraan: 'mobil' })
    const hasil = JSON.stringify(await t.query(api.room.lihat, { kode: pembuat.kode }))
    expect(hasil).not.toContain(pembuat.kunci)
    expect(hasil).not.toContain(teman.kunci)
  })
})

/** `room.tetap` dari `lihat`, atau galatnya kalau room sudah tidak bisa dilihat. */
async function tetapDari(t: Tes, kode: string) {
  const hasil = await t.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil.room.tetap
}

/** Room siap yang hasilnya sudah memperhitungkan lokasi Bintang. Haikal belum berbagi lokasi. */
async function roomDenganHasil(t: Tes) {
  const { haikal, bintang } = await roomSiap(t)
  await t.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: -6.22, lng: 106.85 } })
  await t.run(async (ctx) => {
    const room = (await ctx.db.query('room').first())!
    await ctx.db.patch('room', room._id, { versiHasil: room.versiLokasi })
  })
  return { haikal, bintang }
}

async function lihatRoom(t: Tes, kode: string) {
  const hasil = await t.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil
}

describe('kendaraan (Discussions #63)', () => {
  it('orang bisa gabung dengan transportasi umum', async () => {
    const t = siapkan()
    const { kode } = await roomBaru(t)
    await t.mutation(api.room.gabung, { kode, nama: 'Bintang', kendaraan: 'transportasi_umum' })
    expect((await lihatRoom(t, kode)).peserta.map((p) => p.kendaraan)).toEqual(['motor', 'transportasi_umum'])
  })

  it('ganti kendaraan tanpa keluar room membuat hasil usang kalau orangnya ikut dihitung', async () => {
    const t = siapkan()
    const { haikal, bintang } = await roomDenganHasil(t)
    await t.mutation(api.room.ubahKendaraan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kendaraan: 'transportasi_umum' })

    const hasil = await lihatRoom(t, haikal.kode)
    expect(hasil.peserta.map((p) => p.kendaraan)).toEqual(['motor', 'transportasi_umum'])
    expect(hasil.room.hasilUsang).toBe(true)
  })

  it('ganti kendaraan sebelum berbagi lokasi, atau ke kendaraan yang sama, tidak membuat hasil usang', async () => {
    const t = siapkan()
    const { haikal, bintang } = await roomDenganHasil(t)
    await t.mutation(api.room.ubahKendaraan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kendaraan: 'jalan_kaki' })
    await t.mutation(api.room.ubahKendaraan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kendaraan: 'mobil' })

    const hasil = await lihatRoom(t, haikal.kode)
    expect(hasil.peserta.map((p) => p.kendaraan)).toEqual(['jalan_kaki', 'mobil'])
    expect(hasil.room.hasilUsang).toBe(false)
  })

  it('hanya pemilik kunci yang bisa mengganti kendaraannya', async () => {
    const t = siapkan()
    const { haikal, bintang } = await roomSiap(t)
    expect(
      await galatDari(t.mutation(api.room.ubahKendaraan, { pesertaId: bintang.pesertaId, kunci: haikal.kunci, kendaraan: 'motor' })),
    ).toBe('PESERTA_TIDAK_DIKENAL')
    expect((await lihatRoom(t, haikal.kode)).peserta.map((p) => p.kendaraan)).toEqual(['motor', 'mobil'])
  })

  it('orang yang belum terjangkau transportasi umum tidak disebut lagi setelah ganti kendaraan', async () => {
    const t = siapkan()
    const { haikal, bintang } = await roomDenganHasil(t)
    const gagalUntukBintang = (galatHitung: 'TRANSPORTASI_UMUM_TIDAK_TERJANGKAU' | 'LOKASI_TIDAK_TERJANGKAU') =>
      t.run(async (ctx) => {
        const room = (await ctx.db.query('room').first())!
        await ctx.db.patch('room', room._id, { status: 'gagal', galatHitung, pesertaTidakTerjangkau: bintang.pesertaId })
      })

    await gagalUntukBintang('TRANSPORTASI_UMUM_TIDAK_TERJANGKAU')
    // Orang lain yang ganti kendaraan tidak mengubah siapa yang perlu bertindak.
    await t.mutation(api.room.ubahKendaraan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kendaraan: 'mobil' })
    expect((await lihatRoom(t, haikal.kode)).room.pesertaTidakTerjangkau).toBe(bintang.pesertaId)
    await t.mutation(api.room.ubahKendaraan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kendaraan: 'motor' })
    // Galatnya tetap sampai dicari lagi, tapi Bintang tidak lagi disebut.
    expect((await lihatRoom(t, haikal.kode)).room).toMatchObject({
      status: 'gagal',
      galatHitung: 'TRANSPORTASI_UMUM_TIDAK_TERJANGKAU',
      pesertaTidakTerjangkau: null,
    })

    // Lokasi yang jauh dari jalan tetap bermasalah walaupun kendaraannya diganti, jadi orangnya tetap disebut.
    await gagalUntukBintang('LOKASI_TIDAK_TERJANGKAU')
    await t.mutation(api.room.ubahKendaraan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kendaraan: 'mobil' })
    expect((await lihatRoom(t, haikal.kode)).room.pesertaTidakTerjangkau).toBe(bintang.pesertaId)
  })
})

describe('tetapkan tempat (Discussions #42)', () => {
  it('siapa saja di room bisa menetapkan suara terbanyak, dan semua HP melihatnya', async () => {
    const t = siapkan()
    const { haikal, bintang, kandidat } = await roomSiap(t)
    for (const p of [haikal, bintang]) await t.mutation(api.room.vote, { pesertaId: p.pesertaId, kunci: p.kunci, kandidatId: kandidat[1] })

    // Bintang bukan pembuat room, tetap boleh.
    await t.mutation(api.room.tetapkan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[1] })
    expect(await tetapDari(t, haikal.kode)).toEqual({ kandidatId: kandidat[1], olehPesertaId: bintang.pesertaId, pada: expect.any(Number) })
  })

  it('hanya untuk suara terbanyak saat ini, kalau seri peringkat keadilan yang menang', async () => {
    const t = siapkan()
    const { haikal, kandidat } = await roomSiap(t)
    // Belum ada vote: seri, jadi peringkat 1 yang jadi suara terbanyak.
    expect(await galatDari(t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[1] }))).toBe(
      'PILIHAN_BERUBAH',
    )
    expect(await tetapDari(t, haikal.kode)).toBeNull()
    await t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[0] })
    expect(await tetapDari(t, haikal.kode)).toMatchObject({ kandidatId: kandidat[0] })
  })

  it('hanya saat hasil siap, untuk kandidat room itu, dan oleh peserta yang dikenal', async () => {
    const t = siapkan()
    const { haikal, kandidat } = await roomSiap(t)
    const lain = await roomSiap(t)
    expect(
      await galatDari(t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: lain.kandidat[0] })),
    ).toBe('KANDIDAT_TIDAK_ADA')
    expect(await galatDari(t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: 'tebakan', kandidatId: kandidat[0] }))).toBe(
      'PESERTA_TIDAK_DIKENAL',
    )
    expect(await galatDari(t.mutation(api.room.bukaLagi, { pesertaId: haikal.pesertaId, kunci: 'tebakan' }))).toBe('PESERTA_TIDAK_DIKENAL')

    await t.run(async (ctx) => {
      const room = await ctx.db
        .query('room')
        .withIndex('by_kode', (q) => q.eq('kode', haikal.kode))
        .unique()
      await ctx.db.patch('room', room!._id, { status: 'menghitung' })
    })
    expect(await galatDari(t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[0] }))).toBe(
      'ROOM_BELUM_SIAP',
    )
  })

  it('selama tetap: vote, hitung, dan tempat lain ditolak, tapi lokasi masih boleh diubah', async () => {
    const t = siapkan()
    const { haikal, bintang, kandidat } = await roomSiap(t)
    await t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[0] })
    const tetap = await tetapDari(t, haikal.kode)

    expect(await galatDari(t.mutation(api.room.vote, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[1] }))).toBe(
      'ROOM_SUDAH_TETAP',
    )
    expect(await galatDari(t.mutation(api.room.hitung, { pesertaId: bintang.pesertaId, kunci: bintang.kunci }))).toBe('ROOM_SUDAH_TETAP')
    expect(await galatDari(t.mutation(api.room.tetapkan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[1] }))).toBe(
      'ROOM_SUDAH_TETAP',
    )
    // Ketukan ganda untuk tempat yang sama bukan galat, dan tidak mengubah apa pun.
    expect(await galatDari(t.mutation(api.room.tetapkan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[0] }))).toBeNull()
    expect(await tetapDari(t, haikal.kode)).toEqual(tetap)

    await t.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: -6.22, lng: 106.85 } })
    const hasil = await t.query(api.room.lihat, { kode: haikal.kode })
    expect(hasil).toMatchObject({ ok: true, room: { hasilUsang: true, tetap } })
  })

  it('buka lagi mengembalikan voting tanpa menghapus vote yang sudah ada', async () => {
    const t = siapkan()
    const { haikal, bintang, kandidat } = await roomSiap(t)
    // Belum tetap: tidak melakukan apa-apa.
    expect(await galatDari(t.mutation(api.room.bukaLagi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci }))).toBeNull()

    await t.mutation(api.room.vote, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[0] })
    await t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[0] })
    await t.mutation(api.room.bukaLagi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci })
    expect(await tetapDari(t, haikal.kode)).toBeNull()
    expect(await pemilih(t, haikal.kode)).toEqual([[haikal.pesertaId], []])

    await t.mutation(api.room.vote, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[1] })
    expect(await pemilih(t, haikal.kode)).toEqual([[haikal.pesertaId], [bintang.pesertaId]])
  })

  it('kalau yang menetapkan keluar, tempatnya tetap berlaku tanpa nama', async () => {
    const t = siapkan()
    const { haikal, bintang, kandidat } = await roomSiap(t)
    await t.mutation(api.room.tetapkan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: kandidat[0] })
    await t.mutation(api.room.keluar, { pesertaId: bintang.pesertaId, kunci: bintang.kunci })

    const hasil = await t.query(api.room.lihat, { kode: haikal.kode })
    if (!hasil.ok) throw new Error(hasil.galat)
    expect(hasil.room.tetap).toMatchObject({ kandidatId: kandidat[0], olehPesertaId: bintang.pesertaId })
    expect(hasil.peserta.map((p) => p.id)).toEqual([haikal.pesertaId])
  })

  it('ikut dihapus bersama data pribadi saat room berakhir', async () => {
    const t = siapkan()
    const { haikal, kandidat } = await roomSiap(t)
    await t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[0] })
    const roomId = await t.run(async (ctx) => (await ctx.db.query('room').first())!._id)
    await t.mutation(internal.room.tandaiKedaluwarsa, { roomId })
    // Dicek di dalam t.run, karena nilai yang dikembalikan t.run mengubah undefined jadi null.
    expect(await t.run(async (ctx) => (await ctx.db.get('room', roomId))?.tetap === undefined)).toBe(true)
  })
})

const ubah = (t: Tes, p: { pesertaId: Id<'peserta'>; kunci: string }, jamKetemuan: number | null) =>
  t.mutation(api.room.ubahJamKetemuan, { pesertaId: p.pesertaId, kunci: p.kunci, jamKetemuan })

describe('jam ketemuan (Discussions #83)', () => {
  /** Rabu 21 Oktober 2026, 10.00 WIB. */
  const SEKARANG = Date.parse('2026-10-21T10:00+07:00')
  const JAM_TUJUH = Date.parse('2026-10-21T19:00+07:00')

  /** Jam sistem dibuat tetap, supaya batas 7 hari dan detik yang dibuang bisa dicek pasti. */
  function jamSistem() {
    vi.useFakeTimers()
    vi.setSystemTime(SEKARANG)
    onTestFinished(() => {
      vi.useRealTimers()
    })
  }

  it('siapa saja di room bisa mengisi dan mengosongkannya, dan semua HP melihatnya', async () => {
    jamSistem()
    const t = siapkan()
    const haikal = await roomBaru(t)
    const bintang = await t.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
    expect((await lihatRoom(t, haikal.kode)).room.jamKetemuan).toBeNull()

    // Bintang bukan pembuat room, tetap boleh. Detiknya dibuang.
    await ubah(t, bintang, JAM_TUJUH + 45_000)
    expect((await lihatRoom(t, haikal.kode)).room.jamKetemuan).toEqual({ waktu: JAM_TUJUH, olehPesertaId: bintang.pesertaId })

    await ubah(t, haikal, null)
    expect((await lihatRoom(t, haikal.kode)).room.jamKetemuan).toBeNull()
  })

  it('menolak jam yang sudah lewat atau lebih dari 7 hari lagi, dan jam yang lama tetap', async () => {
    jamSistem()
    const t = siapkan()
    const haikal = await roomBaru(t)
    await ubah(t, haikal, JAM_TUJUH)

    for (const salah of [SEKARANG - 10 * 60_000, SEKARANG + 8 * 24 * 60 * 60_000, Number.NaN]) {
      expect(await galatDari(ubah(t, haikal, salah))).toBe('JAM_KETEMUAN_TIDAK_VALID')
    }
    expect((await lihatRoom(t, haikal.kode)).room.jamKetemuan).toEqual({ waktu: JAM_TUJUH, olehPesertaId: haikal.pesertaId })
  })

  it('hanya pemilik kunci yang bisa mengubahnya', async () => {
    jamSistem()
    const t = siapkan()
    const haikal = await roomBaru(t)
    expect(await galatDari(ubah(t, { pesertaId: haikal.pesertaId, kunci: 'tebakan' }, JAM_TUJUH))).toBe('PESERTA_TIDAK_DIKENAL')
    expect((await lihatRoom(t, haikal.kode)).room.jamKetemuan).toBeNull()
  })

  it('jam yang berubah membuat hasil usang, juga setelah tempat ditetapkan, tanpa mengubah tempatnya', async () => {
    jamSistem()
    const t = siapkan()
    const { haikal, bintang, kandidat } = await roomSiap(t)
    expect((await lihatRoom(t, haikal.kode)).room.hasilUsang).toBe(false)

    await ubah(t, bintang, JAM_TUJUH)
    expect((await lihatRoom(t, haikal.kode)).room.hasilUsang).toBe(true)

    await t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: kandidat[0] })
    await ubah(t, bintang, JAM_TUJUH + 30 * 60_000)
    const { room } = await lihatRoom(t, haikal.kode)
    expect(room.jamKetemuan).toMatchObject({ waktu: JAM_TUJUH + 30 * 60_000 })
    expect(room.tetap).toMatchObject({ kandidatId: kandidat[0], olehPesertaId: haikal.pesertaId })
  })

  it('jam yang sama tidak membuat hasil usang lagi', async () => {
    jamSistem()
    const t = siapkan()
    const { haikal, bintang } = await roomSiap(t)
    await ubah(t, haikal, JAM_TUJUH)
    // Hasil dihitung ulang dengan jam itu.
    await t.run(async (ctx) => {
      const room = (await ctx.db.query('room').first())!
      await ctx.db.patch('room', room._id, { versiHasil: room.versiLokasi })
    })

    // Detik yang berbeda dibuang, jadi jamnya sama. Orang yang mengisinya juga tidak berganti.
    await ubah(t, bintang, JAM_TUJUH + 20_000)
    const { room } = await lihatRoom(t, haikal.kode)
    expect(room.hasilUsang).toBe(false)
    expect(room.jamKetemuan).toEqual({ waktu: JAM_TUJUH, olehPesertaId: haikal.pesertaId })
  })

  it('dikosongkan saat room berakhir', async () => {
    jamSistem()
    const t = siapkan()
    const haikal = await roomBaru(t)
    await ubah(t, haikal, JAM_TUJUH)
    const roomId = await t.run(async (ctx) => (await ctx.db.query('room').first())!._id)
    await t.mutation(internal.room.tandaiKedaluwarsa, { roomId })
    // Dicek di dalam t.run, karena nilai yang dikembalikan t.run mengubah undefined jadi null.
    expect(await t.run(async (ctx) => (await ctx.db.get('room', roomId))?.jamKetemuan === undefined)).toBe(true)
  })
})
