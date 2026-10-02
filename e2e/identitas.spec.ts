import { expect, test } from '@playwright/test'

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

test('pin teman diberi warna dan aksesori menurut urutan gabung', async ({ page }) => {
  await page.goto('/')
  const pin = (urutan: number) => page.getByRole('img', { name: `Orang ke-${urutan}`, exact: true })

  await expect(pin(1)).toHaveAttribute('data-warna', '1')
  await expect(pin(1)).toHaveAttribute('data-aksesori', 'polos')
  await expect(pin(9)).toHaveAttribute('data-warna', '1')
  await expect(pin(9)).toHaveAttribute('data-aksesori', 'kacamata')
  await expect(pin(17)).toHaveAttribute('data-aksesori', 'pita')
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

test('tidak ada scroll horizontal di layar 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const melebar = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(melebar).toBe(false)
})
