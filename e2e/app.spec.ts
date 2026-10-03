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

test('PWA bisa dipasang: manifest punya ikon 192, 512, dan maskable yang benar-benar ada', async ({ page }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  const ikon = manifest.icons as { src: string; sizes: string; purpose?: string }[]
  expect(ikon.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(ikon.some((i) => i.purpose === 'maskable')).toBe(true)
  for (const i of ikon) {
    const jawaban = await page.request.get(`/${i.src}`)
    expect(jawaban.status(), i.src).toBe(200)
    expect(jawaban.headers()['content-type']).toContain('image/png')
  }
})

test('link yang dibagikan ke WhatsApp punya kartu pratinjau', async ({ page }) => {
  await page.goto('/r/ABC234')
  const meta = (nama: string) => page.locator(`meta[property="${nama}"]`).getAttribute('content')
  expect(await meta('og:title')).toContain('Tikoem')
  expect(await meta('og:image')).toBe('https://tikoem.vercel.app/og.png')
  const gambar = await page.request.get('/og.png')
  expect(gambar.status()).toBe(200)
  expect(gambar.headers()['content-type']).toContain('image/png')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon-180x180.png')
})
