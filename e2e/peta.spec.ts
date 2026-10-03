import { expect, test, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

const convex = new ConvexHttpClient(URL_BACKEND)

// Test tidak bergantung pada server peta di internet. Peta dasar sengaja gagal, pin teman harus tetap tampil.
test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (rute) => rute.abort())
})

async function masukSebagai(page: Page, kode: string, identitas: { pesertaId: string; kunci: string }) {
  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, JSON.stringify(v)), [kode, identitas] as const)
  await page.goto(`/r/${kode}`)
}

test('peta menampilkan pin teman dan perkiraan titik tengah, lalu ikut bertambah secara realtime', async ({ page }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'mobil' })
  const { kode } = haikal
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.2, lng: 106.85 } })

  await masukSebagai(page, kode, haikal)
  await expect(page.getByRole('heading', { name: 'Peta teman' })).toBeVisible()
  const peta = page.locator('[data-peta-live]')
  await expect(peta.locator('[data-pin-peta]')).toHaveCount(1)
  await expect(peta.locator('[data-pin-peta]')).toContainText('Kamu')
  // Peta harus benar-benar mengisi kartunya, bukan hanya ada di DOM.
  const kanvas = await peta.locator('canvas').boundingBox()
  expect(kanvas?.height).toBeGreaterThan(200)
  const pinSaya = await peta.locator('[data-pin-peta]').boundingBox()
  const kotakPeta = await peta.boundingBox()
  expect(pinSaya!.y).toBeGreaterThan(kotakPeta!.y)
  expect(pinSaya!.y + pinSaya!.height).toBeLessThan(kotakPeta!.y + kotakPeta!.height)
  await expect(peta.locator('[data-titik-tengah]')).toHaveCount(0)
  await expect(page.getByText('Titik tengah muncul setelah minimal 2 orang berbagi lokasi.')).toBeVisible()
  await expect(page.getByText('Peta dasar belum termuat. Pin teman tetap ditampilkan.')).toBeVisible()

  const umar = await convex.mutation(api.room.gabung, { kode, nama: 'Umar Said', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: { lat: -6.26, lng: 106.81 } })

  await expect(peta.locator('[data-pin-peta]')).toHaveCount(2)
  await expect(peta.locator(`[data-pin-peta="${umar.pesertaId}"]`)).toContainText('Umar')
  await expect(peta.locator('[data-titik-tengah]')).toHaveCount(1)
  await expect(page.getByText(/Orang terjauh 4(,\d)? km dari situ\./)).toBeVisible()
})

test('pin yang berdekatan di layar disebar supaya semuanya terlihat', async ({ page }) => {
  const a = await convex.mutation(api.room.buat, { nama: 'Raka', kendaraan: 'motor' })
  const b = await convex.mutation(api.room.gabung, { kode: a.kode, nama: 'Tio', kendaraan: 'motor' })
  // Dua rumah berdekatan: setelah disamarkan jaraknya ~110 m, di layar hanya beberapa piksel.
  await convex.mutation(api.room.kirimLokasi, { pesertaId: a.pesertaId, kunci: a.kunci, lokasi: { lat: -6.2001, lng: 106.8501 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: b.pesertaId, kunci: b.kunci, lokasi: { lat: -6.2006, lng: 106.8502 } })

  await masukSebagai(page, a.kode, a)
  const pin = page.locator('[data-peta-live] [data-pin-peta]')
  await expect(pin).toHaveCount(2)
  const [kotakA, kotakB] = await Promise.all([pin.nth(0).boundingBox(), pin.nth(1).boundingBox()])
  expect(Math.abs(kotakA!.x - kotakB!.x)).toBeGreaterThan(10)
})

test('belum ada lokasi: peta belum dimuat, diganti keadaan kosong', async ({ page }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'mobil' })
  await masukSebagai(page, haikal.kode, haikal)
  await expect(page.getByText('Belum ada yang berbagi lokasi.')).toBeVisible()
  await expect(page.locator('[data-peta-live]')).toHaveCount(0)
})

test('tamu yang belum gabung tidak melihat lokasi teman di peta', async ({ page }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'mobil' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.2, lng: 106.85 } })
  await page.goto(`/r/${haikal.kode}`)
  await expect(page.getByRole('heading', { name: 'Gabung ke room ini' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Peta teman' })).toHaveCount(0)
})

test('setelah hasil keluar, peta menampilkan kandidat dan bintang suara terbanyak', async ({ page }) => {
  test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
  const lokasi = [
    [haikal, { lat: -6.262, lng: 106.813 }],
    [bintang, { lat: -6.226, lng: 106.858 }],
    [umar, { lat: -6.158, lng: 106.905 }],
  ] as const
  for (const [p, titik] of lokasi) await convex.mutation(api.room.kirimLokasi, { pesertaId: p.pesertaId, kunci: p.kunci, lokasi: titik })

  await masukSebagai(page, haikal.kode, haikal)
  await page.getByRole('button', { name: 'Cari tempat' }).click()
  const peta = page.locator('[data-peta-live]')
  await expect(peta.locator('[data-kandidat-peta]')).toHaveCount(5, { timeout: 30_000 })
  // Belum ada suara: bintang di kandidat paling adil.
  await expect(peta.locator('[data-pilihan-peta]')).toHaveAttribute('data-kandidat-peta', '1')

  const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  for (const p of [bintang, umar]) await convex.mutation(api.room.vote, { pesertaId: p.pesertaId, kunci: p.kunci, kandidatId: hasil.kandidat[2].id })
  await expect(peta.locator('[data-pilihan-peta]')).toHaveAttribute('data-kandidat-peta', '3', { timeout: 15_000 })
  await expect(peta.locator('[data-pilihan-peta]')).toContainText(hasil.kandidat[2].nama)

  await peta.locator('[data-kandidat-peta="4"]').click()
  await expect(page.locator('[data-kandidat="4"]')).toBeInViewport()
})
