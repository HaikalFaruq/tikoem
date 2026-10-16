import { expect, test, type Browser, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

const convex = new ConvexHttpClient(URL_BACKEND)
/** Batas tunggu untuk perubahan dari HP lain yang datang lewat realtime. */
const REALTIME = { timeout: 15_000 }
type Identitas = { pesertaId: string; kunci: string }

/** Satu HP: konteks browser sendiri, jadi localStorage-nya terpisah. Tanpa identitas berarti tamu yang belum gabung. */
async function hp(browser: Browser, kode: string, identitas?: Identitas): Promise<Page> {
  const konteks = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await konteks.addInitScript(() => sessionStorage.setItem('tikoem:pembuka', '1'))
  if (identitas) {
    await konteks.addInitScript(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, v), [kode, JSON.stringify(identitas)] as const)
  }
  const halaman = await konteks.newPage()
  await halaman.route('https://tiles.openfreemap.org/**', (rute) => rute.abort())
  await halaman.goto(`/r/${kode}`)
  return halaman
}

/** Room berisi Haikal, Bintang, dan Umar dengan lokasi di tiga ujung Jakarta, seperti e2e/layanan.spec.ts. */
async function roomBertiga() {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'jalan_kaki' })
  const lokasi = [
    [haikal, { lat: -6.262, lng: 106.813 }],
    [bintang, { lat: -6.226, lng: 106.858 }],
    [umar, { lat: -6.158, lng: 106.905 }],
  ] as const
  for (const [p, titik] of lokasi) await convex.mutation(api.room.kirimLokasi, { pesertaId: p.pesertaId, kunci: p.kunci, lokasi: titik })
  return { kode: haikal.kode, haikal, bintang }
}

const popup = (halaman: Page) => halaman.getByRole('dialog', { name: 'Traktir Tikoem kopi?' })

test('pop up traktir muncul di HP yang sudah gabung saat tempat dicari, sekali per room, lalu bisa dibuka lagi lewat tombol', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const { kode, haikal, bintang } = await roomBertiga()
  const hpHaikal = await hp(browser, kode, haikal)
  const hpBintang = await hp(browser, kode, bintang)
  const hpTamu = await hp(browser, kode)
  await expect(hpHaikal.getByText('Semua sudah siap.')).toBeVisible()
  await expect(hpBintang.getByText('Semua sudah siap.')).toBeVisible()
  await expect(hpTamu.getByRole('heading', { name: 'Gabung ke room ini' })).toBeVisible()
  await expect(popup(hpHaikal)).toBeHidden()

  await hpHaikal.getByRole('button', { name: 'Cari tempat' }).click()
  await expect(popup(hpHaikal)).toBeVisible()
  await expect(popup(hpBintang)).toBeVisible(REALTIME)
  await expect(popup(hpHaikal).getByRole('link', { name: 'Traktir lewat Sociabuzz' })).toHaveAttribute(
    'href',
    'https://sociabuzz.com/byhund/tribe',
  )
  await expect(popup(hpHaikal).getByRole('link', { name: 'Traktir lewat Sociabuzz' })).toHaveAttribute('target', '_blank')

  // Pop up ikut mengabarkan pencarian: setelah hasil keluar, aksi lainnya membawa ke hasil.
  await expect(popup(hpHaikal)).toContainText('Tempatnya sudah ketemu!', { timeout: 30_000 })
  await popup(hpHaikal).getByRole('button', { name: 'Lihat hasil' }).click()
  await expect(popup(hpHaikal)).toBeHidden()
  await expect(hpHaikal.getByRole('heading', { name: 'Tempat paling adil' })).toBeInViewport()

  // Esc juga menutup pop up.
  await hpBintang.keyboard.press('Escape')
  await expect(popup(hpBintang)).toBeHidden()

  // Tamu yang belum gabung tidak mendapat pop up.
  await expect(hpTamu.getByRole('dialog')).toHaveCount(0)

  // Sekali per room: dibuka ulang setelah hasil keluar, pop up tidak muncul lagi.
  await hpHaikal.reload()
  await expect(hpHaikal.getByRole('heading', { name: 'Tempat paling adil' })).toBeVisible()
  await expect(popup(hpHaikal)).toBeHidden()

  // Tombol di bawah layar room membuka pop up yang sama, tanpa status pencarian.
  await hpHaikal.getByRole('button', { name: 'Traktir Tikoem' }).click()
  await expect(popup(hpHaikal)).toBeVisible()
  await expect(popup(hpHaikal)).not.toContainText('Tempatnya sudah ketemu!')
  await hpHaikal.setViewportSize({ width: 320, height: 640 })
  expect(await hpHaikal.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await popup(hpHaikal).getByRole('button', { name: 'Nanti saja' }).click()
  await expect(popup(hpHaikal)).toBeHidden()
})
