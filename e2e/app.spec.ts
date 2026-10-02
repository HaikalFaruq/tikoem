import { expect, test } from '@playwright/test'

test('halaman awal tampil tanpa scroll horizontal di layar 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Tikoem' })).toBeVisible()
  const melebar = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(melebar).toBe(false)
})

test('PWA punya manifest dan service worker aktif', async ({ page }) => {
  await page.goto('/')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest.short_name).toBe('Tikoem')
  const swAktif = await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active))
  expect(swAktif).toBe(true)
})
