// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

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

async function roomBaru(t: Tes) {
  const { kode } = await t.mutation(api.room.buat, {})
  return kode
}

describe('room lewat link', () => {
  it('membuat room baru yang bisa dibuka dengan kode huruf kecil', async () => {
    const t = siapkan()
    const kode = await roomBaru(t)
    expect(kode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)

    const hasil = await t.query(api.room.lihat, { kode: kode.toLowerCase() })
    expect(hasil).toMatchObject({ ok: true, room: { kode, status: 'menunggu_peserta', titikTengah: null }, peserta: [] })
  })

  it('memberi urutan gabung mulai dari 1 dan mengurutkan peserta', async () => {
    const t = siapkan()
    const kode = await roomBaru(t)
    await t.mutation(api.room.gabung, { kode, nama: 'Haikal', kendaraan: 'motor' })
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
    const kode = await roomBaru(t)
    const [a, b] = await Promise.all([
      t.mutation(api.room.gabung, { kode, nama: 'A', kendaraan: 'motor' }),
      t.mutation(api.room.gabung, { kode, nama: 'B', kendaraan: 'motor' }),
    ])
    expect([a.urutanGabung, b.urutanGabung].toSorted((x, y) => x - y)).toEqual([1, 2])
  })

  it('menolak orang ke-25 dengan ROOM_PENUH', async () => {
    const t = siapkan()
    const kode = await roomBaru(t)
    for (let i = 1; i <= 24; i++) await t.mutation(api.room.gabung, { kode, nama: `Teman ${i}`, kendaraan: 'motor' })
    expect(await galatDari(t.mutation(api.room.gabung, { kode, nama: 'Teman 25', kendaraan: 'motor' }))).toBe('ROOM_PENUH')
  })

  it('menolak room yang tidak ada, kedaluwarsa, atau nama yang kosong', async () => {
    const t = siapkan()
    expect(await galatDari(t.mutation(api.room.gabung, { kode: 'ZZZZZZ', nama: 'A', kendaraan: 'motor' }))).toBe('ROOM_TIDAK_ADA')
    expect(await galatDari(t.mutation(api.room.gabung, { kode: 'bukan kode', nama: 'A', kendaraan: 'motor' }))).toBe('ROOM_TIDAK_ADA')
    expect(await t.query(api.room.lihat, { kode: 'ZZZZZZ' })).toEqual({ ok: false, galat: 'ROOM_TIDAK_ADA' })

    const kode = await roomBaru(t)
    expect(await galatDari(t.mutation(api.room.gabung, { kode, nama: '   ', kendaraan: 'motor' }))).toBe('NAMA_TIDAK_VALID')

    await t.run(async (ctx) => {
      await ctx.db.insert('room', { kode: 'ABCDEF', status: 'menunggu_peserta', kedaluwarsaPada: Date.now() - 1, jumlahGabung: 0 })
    })
    expect(await galatDari(t.mutation(api.room.gabung, { kode: 'ABCDEF', nama: 'A', kendaraan: 'motor' }))).toBe('ROOM_KEDALUWARSA')
    expect(await t.query(api.room.lihat, { kode: 'ABCDEF' })).toEqual({ ok: false, galat: 'ROOM_KEDALUWARSA' })
  })

  it('menyimpan lokasi yang sudah disamarkan dan hanya menerima kunci pemiliknya', async () => {
    const t = siapkan()
    const kode = await roomBaru(t)
    const haikal = await t.mutation(api.room.gabung, { kode, nama: 'Haikal', kendaraan: 'motor' })
    const lokasi = { lat: -6.2087634, lng: 106.8455991 }

    expect(await galatDari(t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: 'tebakan', lokasi }))).toBe(
      'PESERTA_TIDAK_DIKENAL',
    )
    expect(
      await galatDari(
        t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: 120, lng: 0 } }),
      ),
    ).toBe('LOKASI_TIDAK_VALID')

    await t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi })
    const hasil = await t.query(api.room.lihat, { kode })
    if (!hasil.ok) throw new Error(hasil.galat)
    expect(hasil.peserta[0].lokasi).toEqual({ lat: -6.209, lng: 106.846 })
  })

  it('tidak pernah mengirim kunci peserta lewat query', async () => {
    const t = siapkan()
    const kode = await roomBaru(t)
    const { kunci } = await t.mutation(api.room.gabung, { kode, nama: 'Haikal', kendaraan: 'motor' })
    const hasil = await t.query(api.room.lihat, { kode })
    expect(JSON.stringify(hasil)).not.toContain(kunci)
  })
})
