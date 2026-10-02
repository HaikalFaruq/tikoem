import { expect, test, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { URL_BACKEND } from './backend'

async function buatRoomLewatLayar(page: Page, nama: string) {
  await page.goto('/')
  await page.getByLabel('Namamu').fill(nama)
  await page.getByRole('button', { name: 'Buat room' }).click()
  await expect(page).toHaveURL(/\/r\/[23456789A-HJKMNP-Z]{6}$/)
  return new URL(page.url()).pathname.split('/').at(-1)!
}

test('membuat room lalu sampai di room sebagai orang ke-1, siap mengundang lewat WA', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Namamu').fill('  Bintang   Fabian ')
  await page.getByText('Mobil', { exact: true }).click()
  await page.getByRole('button', { name: 'Buat room' }).click()

  await expect(page).toHaveURL(/\/r\/[23456789A-HJKMNP-Z]{6}$/)
  const kode = new URL(page.url()).pathname.split('/').at(-1)!
  await expect(page.getByRole('heading', { level: 1, name: kode })).toBeVisible()
  await expect(page).toHaveTitle(`Room ${kode} · Tikoem`)

  const saya = page.locator('li[data-urutan="1"]')
  await expect(saya).toContainText('Bintang Fabian · kamu')
  await expect(saya).toContainText('Mobil · belum berbagi lokasi')

  const wa = page.getByRole('link', { name: 'Kirim ke grup WA' })
  const tujuan = new URL((await wa.getAttribute('href'))!)
  expect(tujuan.origin + tujuan.pathname).toBe('https://wa.me/')
  expect(tujuan.searchParams.get('text')).toContain(`/r/${kode}`)
  await expect(wa).toHaveAttribute('target', '_blank')
})

test('nama kosong ditolak sebelum dikirim ke backend', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Namamu').fill('   ')
  await page.getByRole('button', { name: 'Buat room' }).click()
  await expect(page.getByLabel('Namamu')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Isi namamu, maksimal 24 karakter.')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('teman yang gabung langsung muncul tanpa memuat ulang halaman', async ({ page }) => {
  const kode = await buatRoomLewatLayar(page, 'Haikal')
  await expect(page.getByText('1 dari 24 orang')).toBeVisible()

  const convex = new ConvexHttpClient(URL_BACKEND)
  await convex.mutation(api.room.gabung, { kode, nama: 'Umar', kendaraan: 'jalan_kaki' })

  const umar = page.locator('li[data-urutan="2"]')
  await expect(umar).toContainText('Umar')
  await expect(umar).toContainText('Jalan kaki')
  await expect(umar).not.toContainText('kamu')
  await expect(page.getByText('2 dari 24 orang')).toBeVisible()
})

test('orang ke-9 memakai warna orang ke-1 dengan kacamata', async ({ page }) => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const { kode } = await convex.mutation(api.room.buat, { nama: 'Orang 1', kendaraan: 'motor' })
  for (let i = 2; i <= 9; i++) await convex.mutation(api.room.gabung, { kode, nama: `Orang ${i}`, kendaraan: 'motor' })

  await page.goto(`/r/${kode}`)
  const pin = (urutan: number) => page.locator(`li[data-urutan="${urutan}"] svg[data-warna]`)
  await expect(pin(1)).toHaveAttribute('data-warna', '1')
  await expect(pin(1)).toHaveAttribute('data-aksesori', 'polos')
  await expect(pin(9)).toHaveAttribute('data-warna', '1')
  await expect(pin(9)).toHaveAttribute('data-aksesori', 'kacamata')
})

test('link dengan kode huruf kecil tetap membuka room-nya', async ({ page }) => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const { kode } = await convex.mutation(api.room.buat, { nama: 'Sari', kendaraan: 'motor' })

  await page.goto(`/r/${kode.toLowerCase()}`)
  await expect(page.getByRole('heading', { level: 1, name: kode })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/r/${kode}$`))
  await expect(page.getByText('Kamu belum gabung room ini.')).toBeVisible()
})

test('salin link menaruh link room di clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const kode = await buatRoomLewatLayar(page, 'Dewi')
  await page.getByRole('button', { name: 'Salin link' }).click()
  await expect(page.getByRole('button', { name: 'Tersalin' })).toBeVisible()
  await expect(page.getByText('Link tersalin. Tempel di grup.')).toHaveCount(1)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/r/${kode}$`))
})

test('room yang tidak ada menampilkan pin kaget dan jalan kembali', async ({ page }) => {
  await page.goto('/r/ZZZZZZ')
  await expect(page.getByRole('heading', { name: 'Room tidak ditemukan' })).toBeVisible()
  await page.getByRole('button', { name: 'Buat room baru' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Buat room' })).toBeVisible()
})
