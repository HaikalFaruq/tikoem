// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

// Pola `!(*.*.*)` dari dokumentasi convex-test tidak didukung glob Vite 8, jadi pakai daftar pola dengan pengecualian.
const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts'])

function siapkan() {
  const t = convexTest(schema, modules)
  rateLimiter.register(t)
  return t
}

/** Kode galat dari action yang ditolak, atau `null` kalau ternyata berhasil. */
const galatDari = (janji: Promise<unknown>) =>
  janji.then(
    () => null,
    (e: unknown) => (e instanceof ConvexError ? (e.data as { galat: string }).galat : String(e)),
  )

/** Nominatim tiruan yang selalu menjawab daftar kosong. */
function nominatimKosong() {
  const ambil = vi.fn<typeof fetch>(async () => Response.json([]))
  vi.stubGlobal('fetch', ambil)
  return ambil
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lokasi.cari', () => {
  it('mengembalikan pilihan alamat dari Nominatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([{ lat: '-6.2232551', lon: '106.8426972', name: 'Kota Kasablanka', address: { village: 'Menteng Dalam', suburb: 'Tebet' } }]),
      ),
    )
    const t = siapkan()
    expect(await t.action(api.lokasi.cari, { teks: 'Kota Kasablanka' })).toEqual([
      { label: 'Kota Kasablanka, Menteng Dalam, Tebet', lokasi: { lat: -6.2232551, lng: 106.8426972 } },
    ])
  })

  it('memberi kode LAYANAN_GAGAL kalau Nominatim gagal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    )
    const t = siapkan()
    const galat = await t.action(api.lokasi.cari, { teks: 'Tebet' }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(galat).toBeInstanceOf(ConvexError)
    expect((galat as ConvexError<{ galat: string }>).data.galat).toBe('LAYANAN_GAGAL')
  })
})

describe('antrean Nominatim OSMF', () => {
  beforeEach(() => {
    // Jam palsu supaya jeda antrean bisa dimajukan tanpa menunggu sungguhan.
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('memberi jarak 1,1 detik antarpermintaan, dan teks yang terlalu pendek tidak memakai jatah', async () => {
    const ambil = nominatimKosong()
    const t = siapkan()
    await t.action(api.lokasi.cari, { teks: 'ab' })
    await t.action(api.lokasi.cari, { teks: 'Tebet' })
    expect(ambil).toHaveBeenCalledTimes(1)

    const kedua = t.action(api.lokasi.cari, { teks: 'Manggarai' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(ambil).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    await kedua
    expect(ambil).toHaveBeenCalledTimes(2)
  })

  it('paling banyak tiga permintaan antre, sisanya langsung LAYANAN_GAGAL tanpa dikirim', async () => {
    const ambil = nominatimKosong()
    const t = siapkan()
    const semua = Promise.all(Array.from({ length: 5 }, (_, i) => galatDari(t.action(api.lokasi.cari, { teks: `Tebet ${i}` }))))
    await vi.advanceTimersByTimeAsync(4000)
    const galat = await semua
    expect(galat.filter((g) => g === null)).toHaveLength(4)
    expect(galat.filter((g) => g === 'LAYANAN_GAGAL')).toHaveLength(1)
    expect(ambil).toHaveBeenCalledTimes(4)
  })

  it('server lain yang diisi lewat NOMINATIM_URL tidak memakai antrean', async () => {
    vi.stubEnv('NOMINATIM_URL', 'http://127.0.0.1:4319/nominatim/search')
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const ambil = nominatimKosong()
    const t = siapkan()
    await Promise.all(Array.from({ length: 5 }, (_, i) => t.action(api.lokasi.cari, { teks: `Tebet ${i}` })))
    expect(ambil).toHaveBeenCalledTimes(5)
  })
})
