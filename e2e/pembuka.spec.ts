import { expect, test } from '@playwright/test'

test('pembuka tampil sekali per sesi, lalu hilang sendiri', async ({ page }) => {
  await page.goto('/')
  const pembuka = page.locator('#pembuka')
  await expect(pembuka).toBeVisible()
  await expect(pembuka).toContainText('tikoem')
  await expect(pembuka).toBeHidden({ timeout: 4_000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Tikoem' })).toBeVisible()

  // Dicek langsung tanpa menunggu: kalau pembuka diputar lagi, ia pasti masih ada sesaat setelah halaman dimuat.
  await page.reload({ waitUntil: 'domcontentloaded' })
  expect(await pembuka.count()).toBe(0)
})

test('pembuka bisa dilewati dengan sekali ketuk', async ({ page }) => {
  await page.goto('/')
  await page.locator('#pembuka').click()
  await expect(page.locator('#pembuka')).toHaveCount(0, { timeout: 1_000 })
})

test('pembuka tidak diputar kalau HP meminta gerak dikurangi', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  expect(await page.locator('#pembuka').count()).toBe(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Tikoem' })).toBeVisible()
})
