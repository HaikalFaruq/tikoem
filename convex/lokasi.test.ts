// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

// Pola `!(*.*.*)` dari dokumentasi convex-test tidak didukung glob Vite 8, jadi pakai daftar pola dengan pengecualian.
const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts'])

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
    const t = convexTest(schema, modules)
    expect(await t.action(api.lokasi.cari, { teks: 'Kota Kasablanka' })).toEqual([
      { label: 'Kota Kasablanka, Menteng Dalam, Tebet', lokasi: { lat: -6.2232551, lng: 106.8426972 } },
    ])
  })

  it('memberi kode LAYANAN_GAGAL kalau Nominatim gagal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    )
    const t = convexTest(schema, modules)
    const galat = await t.action(api.lokasi.cari, { teks: 'Tebet' }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(galat).toBeInstanceOf(ConvexError)
    expect((galat as ConvexError<{ galat: string }>).data.galat).toBe('LAYANAN_GAGAL')
  })
})
