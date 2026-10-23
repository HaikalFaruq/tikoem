import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { LOKASI_RUTE_GAGAL_SEKALI, LOKASI_TANPA_TRANSPORTASI_UMUM, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

// Kontrak ringkasan rute (Discussions #83) lewat backend Convex lokal dan Transitous tiruan. Kartu Fix!-nya di e2e/kartu-fix.spec.ts.
const convex = new ConvexHttpClient(URL_BACKEND)
const MANGGARAI = { lat: -6.2105, lng: 106.8505 }

async function lihat(kode: string) {
  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil
}

/** `rute` milik Sari, ditunggu sampai statusnya bukan `menghitung` lagi. */
async function ruteSari(kode: string) {
  let rute: Awaited<ReturnType<typeof lihat>>['peserta'][number]['rute'] = null
  await expect
    .poll(
      async () => {
        rute = (await lihat(kode)).peserta.find((p) => p.nama === 'Sari')?.rute ?? null
        return rute?.status ?? null
      },
      { timeout: 15_000 },
    )
    .not.toMatch(/^menghitung$|^null$/)
  return rute
}

/** Haikal naik motor dan Sari dari `lokasiSari`, lalu tempat paling adil ditetapkan. */
async function roomTetap(lokasiSari: { lat: number; lng: number }, kendaraanSari: 'motor' | 'transportasi_umum' = 'transportasi_umum') {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const sari = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Sari', kendaraan: kendaraanSari })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.262, lng: 106.813 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: sari.pesertaId, kunci: sari.kunci, lokasi: lokasiSari })
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  await expect.poll(async () => (await lihat(haikal.kode)).room.status, { timeout: 30_000 }).toBe('siap')
  const [teradil] = (await lihat(haikal.kode)).kandidat
  await convex.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: teradil.id })
  return { kode: haikal.kode, haikal, sari }
}

test('setelah tempat ditetapkan, yang naik transportasi umum mendapat ringkasan rute, juga untuk jam ketemuan', async () => {
  const { kode, sari } = await roomTetap(MANGGARAI)
  expect(await ruteSari(kode)).toMatchObject({
    status: 'siap',
    jamKetemuan: null,
    langkah: [
      { jenis: 'jalan', menit: 5, ke: 'Stasiun Tiruan' },
      {
        jenis: 'kereta',
        layanan: 'KRL',
        jalur: 'Commuter Line Tiruan',
        arah: 'Tiruan Baru',
        naik: 'Stasiun Tiruan',
        turun: 'Stasiun Tiruan Baru',
        menit: 12,
        perhentian: 2,
        warna: { latar: '#e30a16', teks: '#ffffff' },
      },
      { jenis: 'jalan', menit: 4, ke: null },
    ],
  })
  expect((await lihat(kode)).peserta.find((p) => p.nama === 'Haikal')?.rute).toBeNull()

  // Transitous tiruan sampai tepat di jam yang diminta.
  const jamKetemuan = Math.floor((Date.now() + 2 * 60 * 60_000) / 60_000) * 60_000
  await convex.mutation(api.room.ubahJamKetemuan, { pesertaId: sari.pesertaId, kunci: sari.kunci, jamKetemuan })
  expect(await ruteSari(kode)).toMatchObject({ status: 'siap', jamKetemuan, berangkat: jamKetemuan - 21 * 60_000, sampai: jamKetemuan })
})

test('dari lokasi yang jauh dari halte dan stasiun, tidak ada rute', async () => {
  // Sari naik motor saat tempat dicari, lalu beralih ke transportasi umum dan pindah ke Cileungsi setelah tempatnya ditetapkan.
  const { kode, sari } = await roomTetap(MANGGARAI, 'motor')
  await convex.mutation(api.room.ubahKendaraan, { pesertaId: sari.pesertaId, kunci: sari.kunci, kendaraan: 'transportasi_umum' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: sari.pesertaId, kunci: sari.kunci, lokasi: LOKASI_TANPA_TRANSPORTASI_UMUM })
  expect(await ruteSari(kode)).toEqual({ status: 'tidak_ada', jamKetemuan: null })
})

test('ringkasan yang gagal bisa dicoba lagi oleh orangnya', async () => {
  const { kode, sari } = await roomTetap(LOKASI_RUTE_GAGAL_SEKALI)
  expect(await ruteSari(kode)).toEqual({ status: 'gagal' })
  await convex.mutation(api.room.hitungRute, { pesertaId: sari.pesertaId, kunci: sari.kunci })
  expect(await ruteSari(kode)).toMatchObject({ status: 'siap' })
})
