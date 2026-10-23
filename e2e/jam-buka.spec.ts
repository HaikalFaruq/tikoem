import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { LOKASI_TEMPAT_TUTUP_MALAM, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

const convex = new ConvexHttpClient(URL_BACKEND)

/** Pukul `jam` WIB berikutnya yang paling sedikit 10 menit lagi, jadi selalu bisa dipakai sebagai jam ketemuan. */
function jamBerikutnya(jam: number) {
  const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  const waktu = Date.parse(`${hariIni}T${String(jam).padStart(2, '0')}:00+07:00`)
  return waktu > Date.now() + 10 * 60_000 ? waktu : waktu + 24 * 3600_000
}

test('dengan jam ketemuan, tempat yang jelas tutup di jam itu tidak ikut dicari (Discussions #74)', async () => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  const { lat, lng } = LOKASI_TEMPAT_TUTUP_MALAM
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: lat + 0.01, lng } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: lat - 0.01, lng } })

  async function cariUntukJam(jam: number) {
    await convex.mutation(api.room.ubahJamKetemuan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, jamKetemuan: jamBerikutnya(jam) })
    await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    let hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
    await expect
      .poll(
        async () => {
          hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
          return hasil.ok ? hasil.room.status : hasil.galat
        },
        { timeout: 30_000 },
      )
      .toMatch(/^(siap|gagal)$/)
    if (!hasil.ok) throw new Error(hasil.galat)
    return hasil
  }

  // Semua tempat di sini tutup pukul 17.00.
  expect((await cariUntukJam(20)).room).toMatchObject({ status: 'gagal', galatHitung: 'TEMPAT_TIDAK_DITEMUKAN' })
  const pagi = await cariUntukJam(10)
  expect(pagi.room.status).toBe('siap')
  expect(pagi.kandidat).toHaveLength(5)
})
