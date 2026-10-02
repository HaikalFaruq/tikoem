import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { URL_BACKEND } from './backend'

test('font identitas ikut dibundel, tidak bergantung pada Google Fonts', async ({ page }) => {
  const dariLuar: string[] = []
  page.on('request', (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) dariLuar.push(r.url())
  })
  await page.goto('/')
  const termuat = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', ''))
  })
  expect(termuat).toContain('Bricolage Grotesque Variable')
  expect(termuat).toContain('Figtree Variable')
  expect(dariLuar).toEqual([])
})

test('latar mengikuti tema: kertas terang dan kertas gelap', async ({ page }) => {
  const latar = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  expect(await latar()).toBe('rgb(242, 244, 255)')

  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await latar()).toBe('rgb(22, 21, 43)')
})

test('pilihan kendaraan bisa diganti dengan ketuk atau keyboard', async ({ page }) => {
  await page.goto('/')
  const motor = page.getByRole('radio', { name: 'Motor' })
  const mobil = page.getByRole('radio', { name: 'Mobil' })
  const jalanKaki = page.getByRole('radio', { name: 'Jalan kaki' })

  await expect(motor).toBeChecked()
  await page.getByText('Mobil', { exact: true }).click()
  await expect(mobil).toBeChecked()
  await expect(motor).not.toBeChecked()

  await mobil.focus()
  await page.keyboard.press('ArrowRight')
  await expect(jalanKaki).toBeChecked()
})

for (const lebar of [320, 390]) {
  test(`beranda dan layar room tidak bergeser ke samping di layar ${lebar} px`, async ({ page }) => {
    await page.setViewportSize({ width: lebar, height: 800 })
    const melebar = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)

    await page.goto('/')
    expect(await melebar()).toBe(false)

    const convex = new ConvexHttpClient(URL_BACKEND)
    const { kode } = await convex.mutation(api.room.buat, { nama: 'Wiraatmadja Kusumaningra', kendaraan: 'jalan_kaki' })
    await page.goto(`/r/${kode}`)
    await expect(page.getByRole('heading', { level: 1, name: kode })).toBeVisible()
    expect(await melebar()).toBe(false)
  })
}
