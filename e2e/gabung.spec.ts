import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { URL_BACKEND } from './backend'

const convex = new ConvexHttpClient(URL_BACKEND)

async function roomDariHaikal() {
  const { kode } = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'mobil' })
  return kode
}

test.describe('dengan izin lokasi', () => {
  // Titik di Tebet. Backend menyamarkannya ke tiga angka di belakang koma.
  test.use({ geolocation: { latitude: -6.226789, longitude: 106.854321 }, permissions: ['geolocation'] })

  test('teman membuka link, gabung, lalu berbagi lokasi yang disamarkan', async ({ page }) => {
    const kode = await roomDariHaikal()
    await page.goto(`/r/${kode}`)
    await expect(page.getByText('Haikal mengajakmu mencari tempat ketemuan.', { exact: false })).toBeVisible()

    await page.getByLabel('Namamu').fill('Umar')
    await page.getByText('Jalan kaki', { exact: true }).click()
    await page.getByRole('button', { name: 'Gabung' }).click()

    const saya = page.locator('li[data-urutan="2"]')
    await expect(saya).toContainText('Umar · kamu')
    await expect(saya).toContainText('belum berbagi lokasi')
    await expect(page.getByRole('link', { name: 'Kirim ke grup WA' })).toBeVisible()

    await page.getByRole('button', { name: 'Pakai lokasiku sekarang' }).click()
    await expect(page.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible()
    await expect(saya).toContainText('lokasi sudah masuk')
    await expect(saya.locator('svg[data-ekspresi]')).toHaveAttribute('data-ekspresi', 'senang')

    const hasil = await convex.query(api.room.lihat, { kode })
    expect(hasil.ok && hasil.peserta[1].lokasi).toEqual({ lat: -6.227, lng: 106.854 })
  })

  test('identitas tetap dikenali setelah halaman dimuat ulang', async ({ page }) => {
    const kode = await roomDariHaikal()
    await page.goto(`/r/${kode}`)
    await page.getByLabel('Namamu').fill('Sari')
    await page.getByRole('button', { name: 'Gabung' }).click()
    await expect(page.locator('li[data-urutan="2"]')).toContainText('Sari · kamu')

    await page.reload()
    await expect(page.locator('li[data-urutan="2"]')).toContainText('Sari · kamu')
    await expect(page.getByRole('heading', { name: 'Gabung ke room ini' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Bagikan lokasimu' })).toBeVisible()
  })
})

test('izin lokasi ditolak memberi penjelasan dan room tetap bisa dipakai', async ({ page }) => {
  const kode = await roomDariHaikal()
  await page.goto(`/r/${kode}`)
  await page.getByLabel('Namamu').fill('Dewi')
  await page.getByRole('button', { name: 'Gabung' }).click()
  await expect(page.locator('li[data-urutan="2"]')).toContainText('Dewi · kamu')

  await page.getByRole('button', { name: 'Pakai lokasiku sekarang' }).click()
  await expect(page.getByRole('alert')).toContainText('Izin lokasi ditolak')
  await expect(page.getByRole('button', { name: 'Pakai lokasiku sekarang' })).toBeEnabled()
})

test('room yang sudah 24 orang menolak orang berikutnya dengan pesan yang jelas', async ({ page }) => {
  const kode = await roomDariHaikal()
  for (let i = 2; i <= 24; i++) await convex.mutation(api.room.gabung, { kode, nama: `Teman ${i}`, kendaraan: 'motor' })

  await page.goto(`/r/${kode}`)
  await expect(page.getByText('24 dari 24 orang')).toBeVisible()
  await page.getByLabel('Namamu').fill('Telat')
  await page.getByRole('button', { name: 'Gabung' }).click()
  await expect(page.getByRole('alert')).toContainText('Room ini sudah penuh. Satu room maksimal 24 orang.')
  await expect(page.locator('li', { hasText: 'Telat' })).toHaveCount(0)
})
