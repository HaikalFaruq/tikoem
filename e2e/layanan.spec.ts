import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexError } from 'convex/values'
import { api } from '../convex/_generated/api'
import {
  LOKASI_LAYANAN_GAGAL,
  LOKASI_TANPA_TEMPAT,
  LOKASI_TANPA_TRANSPORTASI_UMUM,
  LOKASI_TIDAK_TERJANGKAU,
  PAKAI_LAYANAN_TIRUAN,
  URL_BACKEND,
} from './backend'

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

for (const [lokasi, galat] of [
  [LOKASI_TANPA_TEMPAT, 'TEMPAT_TIDAK_DITEMUKAN'],
  [LOKASI_LAYANAN_GAGAL, 'LAYANAN_GAGAL'],
] as const) {
  test(`alur hitung berakhir dengan ${galat} di lokasi khusus layanan tiruan`, async () => {
    const convex = new ConvexHttpClient(URL_BACKEND)
    const a = await convex.mutation(api.room.buat, { nama: 'Satu', kendaraan: 'motor' })
    const b = await convex.mutation(api.room.gabung, { kode: a.kode, nama: 'Dua', kendaraan: 'mobil' })
    await convex.mutation(api.room.kirimLokasi, { pesertaId: a.pesertaId, kunci: a.kunci, lokasi })
    await convex.mutation(api.room.kirimLokasi, { pesertaId: b.pesertaId, kunci: b.kunci, lokasi: { lat: lokasi.lat + 0.01, lng: lokasi.lng + 0.01 } })

    await convex.mutation(api.room.hitung, { pesertaId: a.pesertaId, kunci: a.kunci })
    const keadaan = async () => {
      const hasil = await convex.query(api.room.lihat, { kode: a.kode })
      return hasil.ok ? `${hasil.room.status} ${hasil.room.galatHitung}` : hasil.galat
    }
    await expect.poll(keadaan, { timeout: 30_000 }).toBe(`gagal ${galat}`)
  })
}

test('alur hitung berakhir dengan LOKASI_TIDAK_TERJANGKAU untuk orang yang lokasinya di laut', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const satu = await convex.mutation(api.room.buat, { nama: 'Satu', kendaraan: 'motor' })
  const dua = await convex.mutation(api.room.gabung, { kode: satu.kode, nama: 'Dua', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: satu.pesertaId, kunci: satu.kunci, lokasi: { lat: -6.226, lng: 106.858 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: dua.pesertaId, kunci: dua.kunci, lokasi: LOKASI_TIDAK_TERJANGKAU })

  await convex.mutation(api.room.hitung, { pesertaId: satu.pesertaId, kunci: satu.kunci })
  const keadaan = async () => {
    const hasil = await convex.query(api.room.lihat, { kode: satu.kode })
    return hasil.ok ? `${hasil.room.status} ${hasil.room.galatHitung} ${hasil.room.pesertaTidakTerjangkau}` : hasil.galat
  }
  await expect.poll(keadaan, { timeout: 30_000 }).toBe(`gagal LOKASI_TIDAK_TERJANGKAU ${dua.pesertaId}`)
})

test('alur hitung dengan transportasi umum lewat Transitous tiruan (Discussions #63)', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'transportasi_umum' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.262, lng: 106.813 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: -6.226, lng: 106.858 } })

  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  const status = async () => {
    const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
    return hasil.ok ? `${hasil.room.status} ${hasil.room.galatHitung}` : hasil.galat
  }
  await expect.poll(status, { timeout: 30_000 }).toBe('siap null')

  const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  expect(hasil.kandidat).toHaveLength(5)
  expect(hasil.kandidat.every((k) => k.waktuTempuh.some((w) => w.pesertaId === bintang.pesertaId && w.menit > 0))).toBe(true)
})

test('stasiun dan halte ikut jadi kandidat kalau ada yang naik transportasi umum, paling banyak dua dari lima', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  // Dua orang naik transportasi umum dari arah berlawanan, jadi yang paling adil ada di sekitar titik tengah.
  const barat = await convex.mutation(api.room.buat, { nama: 'Barat', kendaraan: 'transportasi_umum' })
  const timur = await convex.mutation(api.room.gabung, { kode: barat.kode, nama: 'Timur', kendaraan: 'transportasi_umum' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: barat.pesertaId, kunci: barat.kunci, lokasi: { lat: -6.226, lng: 106.838 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: timur.pesertaId, kunci: timur.kunci, lokasi: { lat: -6.226, lng: 106.878 } })

  await convex.mutation(api.room.hitung, { pesertaId: barat.pesertaId, kunci: barat.kunci })
  const status = async () => {
    const hasil = await convex.query(api.room.lihat, { kode: barat.kode })
    return hasil.ok ? `${hasil.room.status} ${hasil.room.galatHitung}` : hasil.galat
  }
  await expect.poll(status, { timeout: 30_000 }).toBe('siap null')

  const hasil = await convex.query(api.room.lihat, { kode: barat.kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  expect(hasil.kandidat).toHaveLength(5)
  // Layanan tiruan menaruh dua stasiun dan satu halte paling dekat ke titik tengah. Yang masuk lima besar cuma dua.
  const stasiun = hasil.kandidat.filter((k) => k.kategori === 'stasiun')
  expect(stasiun).toHaveLength(2)
  expect(stasiun.every((k) => ['Stasiun Tiruan', 'Stasiun Tiruan Baru', 'Halte Tiruan'].includes(k.nama))).toBe(true)
})

test('TRANSPORTASI_UMUM_TIDAK_TERJANGKAU menyebut orangnya, lalu dia ganti kendaraan tanpa keluar room', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'transportasi_umum' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.262, lng: 106.813 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: LOKASI_TANPA_TRANSPORTASI_UMUM })

  const keadaan = async () => {
    const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
    return hasil.ok ? `${hasil.room.status} ${hasil.room.galatHitung} ${hasil.room.pesertaTidakTerjangkau}` : hasil.galat
  }
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  await expect.poll(keadaan, { timeout: 30_000 }).toBe(`gagal TRANSPORTASI_UMUM_TIDAK_TERJANGKAU ${bintang.pesertaId}`)

  await convex.mutation(api.room.ubahKendaraan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kendaraan: 'motor' })
  expect(await keadaan()).toBe('gagal TRANSPORTASI_UMUM_TIDAK_TERJANGKAU null')
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  await expect.poll(keadaan, { timeout: 30_000 }).toBe('siap null null')
})

test('cari alamat lewat Nominatim tiruan, termasuk LAYANAN_GAGAL', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const hasil = await convex.action(api.lokasi.cari, { teks: 'Kota Kasablanka' })
  expect(hasil.map((h) => h.label)).toEqual(['Kota Kasablanka, Menteng Dalam, Tebet, Jakarta Selatan', 'Taman Tebet, Tebet Timur, Tebet, Jakarta Selatan'])

  const galat = await convex.action(api.lokasi.cari, { teks: 'server sedang gagal' }).catch((e: unknown) => e)
  expect(galat).toBeInstanceOf(ConvexError)
  expect((galat as ConvexError<{ galat: string }>).data.galat).toBe('LAYANAN_GAGAL')
})

test('alamat dari titik lewat Nominatim tiruan, termasuk titik di laut dan LAYANAN_GAGAL', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  expect(await convex.action(api.lokasi.alamat, { lokasi: { lat: -6.226, lng: 106.858 } })).toEqual({
    label: 'Tempat Tiruan, Jl. Tiruan Raya, Tebet Timur, Jakarta Selatan',
  })
  expect(await convex.action(api.lokasi.alamat, { lokasi: LOKASI_TIDAK_TERJANGKAU })).toBeNull()

  const galat = await convex.action(api.lokasi.alamat, { lokasi: LOKASI_LAYANAN_GAGAL }).catch((e: unknown) => e)
  expect(galat).toBeInstanceOf(ConvexError)
  expect((galat as ConvexError<{ galat: string }>).data.galat).toBe('LAYANAN_GAGAL')
})
