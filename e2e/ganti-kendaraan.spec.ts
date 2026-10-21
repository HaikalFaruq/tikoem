import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

const convex = new ConvexHttpClient(URL_BACKEND)
const REALTIME = { timeout: 15_000 }

test('ganti kendaraan dari kartu lokasi tanpa keluar room, lalu hasilnya perlu dihitung ulang', async ({ page }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.262, lng: 106.813 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: { lat: -6.226, lng: 106.858 } })
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  // Halaman dibuka setelah hasilnya keluar, supaya pop up traktir (muncul saat pencarian berjalan) tidak menutupi layar.
  await expect
    .poll(async () => {
      const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
      return hasil.ok ? hasil.room.status : null
    }, { timeout: 30_000 })
    .toBe('siap')

  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, JSON.stringify(v)), [haikal.kode, haikal] as const)
  await page.goto(`/r/${haikal.kode}`)
  await expect(page.getByRole('heading', { name: 'Tempat paling adil' })).toBeVisible({ timeout: 30_000 })

  const kartu = page.locator('section[aria-labelledby="lokasi-judul"]')
  await expect(kartu).toContainText('Berangkat naik Motor')
  await kartu.getByRole('button', { name: 'Ganti kendaraan' }).click()
  // Kendaraan yang sama tidak perlu disimpan.
  await expect(kartu.getByRole('button', { name: 'Simpan' })).toBeDisabled()
  await kartu.getByText('Jalan kaki', { exact: true }).click()
  await kartu.getByRole('button', { name: 'Simpan' }).click()

  await expect(kartu).toContainText('Berangkat naik Jalan kaki', REALTIME)
  await expect(page.locator('li[data-urutan="1"]')).toContainText('Jalan kaki · lokasi sudah masuk')
  await expect(page.getByText('Ada lokasi atau kendaraan yang berubah')).toBeVisible(REALTIME)

  // Batal menutup pilihan tanpa mengubah apa pun.
  await kartu.getByRole('button', { name: 'Ganti kendaraan' }).click()
  await kartu.getByRole('button', { name: 'Batal' }).click()
  await expect(kartu).toContainText('Berangkat naik Jalan kaki')
})
