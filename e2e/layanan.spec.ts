import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexError } from 'convex/values'
import { api } from '../convex/_generated/api'
import { PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

test('alur hitung sampai lima kandidat paling adil, lewat Overpass dan ORS tiruan', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'jalan_kaki' })
  const lokasi = [
    [haikal, { lat: -6.262, lng: 106.813 }],
    [bintang, { lat: -6.226, lng: 106.858 }],
    [umar, { lat: -6.158, lng: 106.905 }],
  ] as const
  for (const [p, titik] of lokasi) await convex.mutation(api.room.kirimLokasi, { pesertaId: p.pesertaId, kunci: p.kunci, lokasi: titik })

  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  const status = async () => {
    const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
    return hasil.ok ? hasil.room.status : hasil.galat
  }
  await expect.poll(status, { timeout: 30_000 }).toBe('siap')

  const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  expect(hasil.room).toMatchObject({ galatHitung: null, hasilUsang: false })
  expect(hasil.kandidat.map((k) => k.peringkat)).toEqual([1, 2, 3, 4, 5])
  expect(hasil.kandidat.every((k) => k.nama.startsWith('Tempat Tiruan') && k.waktuTempuh.length === 3)).toBe(true)
  const terlama = hasil.kandidat.map((k) => k.terlamaMenit)
  expect(terlama).toEqual(terlama.toSorted((a, b) => a - b))
})

test('cari alamat lewat Nominatim tiruan, termasuk LAYANAN_GAGAL', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const hasil = await convex.action(api.lokasi.cari, { teks: 'Kota Kasablanka' })
  expect(hasil.map((h) => h.label)).toEqual(['Kota Kasablanka, Menteng Dalam, Tebet, Jakarta Selatan', 'Taman Tebet, Tebet Timur, Tebet, Jakarta Selatan'])

  const galat = await convex.action(api.lokasi.cari, { teks: 'server sedang gagal' }).catch((e: unknown) => e)
  expect(galat).toBeInstanceOf(ConvexError)
  expect((galat as ConvexError<{ galat: string }>).data.galat).toBe('LAYANAN_GAGAL')
})
