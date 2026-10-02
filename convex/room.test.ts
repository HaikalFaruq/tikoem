// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { api } from './_generated/api'
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

  it('menandai room kedaluwarsa tepat 24 jam setelah dibuat', async () => {
    vi.useFakeTimers()
    try {
      const t = siapkan()
      const { kode, pesertaId, kunci } = await roomBaru(t)

      vi.advanceTimersByTime(MASA_ROOM_MS - 1000)
      await t.finishInProgressScheduledFunctions()
      expect((await t.query(api.room.lihat, { kode })).ok).toBe(true)

      vi.advanceTimersByTime(1000)
      await t.finishInProgressScheduledFunctions()
      expect(await t.query(api.room.lihat, { kode })).toEqual({ ok: false, galat: 'ROOM_KEDALUWARSA' })
      expect(await galatDari(t.mutation(api.room.gabung, { kode, nama: 'Telat', kendaraan: 'motor' }))).toBe('ROOM_KEDALUWARSA')
      expect(
        await galatDari(t.mutation(api.room.kirimLokasi, { pesertaId, kunci, lokasi: { lat: -6.2, lng: 106.8 } })),
      ).toBe('ROOM_KEDALUWARSA')
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
      room: { status: 'menunggu_peserta', galatHitung: null, hasilPada: null, hasilUsang: false },
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

  it('tidak pernah mengirim kunci peserta lewat query', async () => {
    const t = siapkan()
    const pembuat = await roomBaru(t)
    const teman = await t.mutation(api.room.gabung, { kode: pembuat.kode, nama: 'Bintang', kendaraan: 'mobil' })
    const hasil = JSON.stringify(await t.query(api.room.lihat, { kode: pembuat.kode }))
    expect(hasil).not.toContain(pembuat.kunci)
    expect(hasil).not.toContain(teman.kunci)
  })
})
