import { expect, test, type Browser, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

const convex = new ConvexHttpClient(URL_BACKEND)
/** Batas tunggu untuk perubahan dari HP lain yang datang lewat realtime. */
const REALTIME = { timeout: 15_000 }
type Identitas = { pesertaId: string; kunci: string }

/** Satu HP: konteks browser sendiri, jadi localStorage-nya terpisah. */
async function hp(browser: Browser, kode: string, identitas: Identitas): Promise<Page> {
  const konteks = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await konteks.addInitScript(() => sessionStorage.setItem('tikoem:pembuka', '1'))
  await konteks.addInitScript(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, v), [kode, JSON.stringify(identitas)] as const)
  const halaman = await konteks.newPage()
  await halaman.route('https://tiles.openfreemap.org/**', (rute) => rute.abort())
  await halaman.goto(`/r/${kode}`)
  return halaman
}

/** Pukul `jam` WIB besok, dalam milidetik. */
function besokPukul(jam: string) {
  const besok = new Date(Date.now() + 7 * 3600_000 + 24 * 3600_000).toISOString().slice(0, 10)
  return Date.parse(`${besok}T${jam}:00+07:00`)
}

async function jamDiBackend(kode: string) {
  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil.room.jamKetemuan?.waktu ?? null
}

async function roomBerdua() {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.262, lng: 106.813 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, lokasi: { lat: -6.226, lng: 106.858 } })
  return { kode: haikal.kode, haikal, bintang }
}

const barisJam = (halaman: Page) => halaman.locator('[data-jam-ketemuan]')

test('jam ketemuan diatur di dekat Cari tempat, terlihat di HP lain, dan ikut ke kartu hasil serta teks WA', async ({ browser }) => {
  test.setTimeout(90_000)
  const { kode, haikal, bintang } = await roomBerdua()
  const hpHaikal = await hp(browser, kode, haikal)
  const hpBintang = await hp(browser, kode, bintang)
  await expect(barisJam(hpHaikal)).toContainText('Jam ketemuan belum diatur')
  await expect(barisJam(hpHaikal)).toContainText('Opsional.')

  await hpHaikal.getByRole('button', { name: 'Atur jam' }).click()
  const isian = hpHaikal.locator('[data-isian-jam-ketemuan]')
  await isian.getByText('Besok', { exact: true }).click()
  await isian.getByLabel('Jam (WIB)').fill('19:30')
  await hpHaikal.setViewportSize({ width: 320, height: 640 })
  expect(await hpHaikal.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await isian.getByRole('button', { name: 'Simpan' }).click()

  await expect(barisJam(hpHaikal)).toContainText('Besok · 19.30 WIB')
  await expect(barisJam(hpHaikal)).toContainText('Tempat yang tutup di jam itu tidak ikut dicari.')
  expect(await jamDiBackend(kode)).toBe(besokPukul('19:30'))
  await expect(barisJam(hpBintang)).toContainText('Besok · 19.30 WIB', REALTIME)

  // Setelah hasil keluar, jamnya ada di kartu hasil dan di teks untuk grup.
  await hpBintang.getByRole('button', { name: 'Cari tempat' }).click()
  await hpBintang.getByRole('dialog', { name: 'Traktir Tikoem kopi?' }).getByRole('button', { name: 'Tutup' }).click()
  const kartu = hpBintang.locator('[data-kartu-hasil]')
  await expect(kartu).toBeVisible({ timeout: 30_000 })
  await expect(kartu.locator('[data-jam-ketemuan]')).toContainText('Besok · 19.30 WIB')
  const linkWa = decodeURIComponent((await kartu.getByRole('link', { name: 'Kirim hasil ke grup WA' }).getAttribute('href')) ?? '')
  expect(linkWa).toContain('Jam: *')
  expect(linkWa).toContain('19.30 WIB*')

  // Jam yang berubah setelah hasil keluar membuat hasilnya usang (Discussions #83).
  await kartu.getByRole('button', { name: 'Ubah' }).click()
  await kartu.getByLabel('Jam (WIB)').fill('20:00')
  await kartu.getByRole('button', { name: 'Simpan' }).click()
  await expect(kartu.locator('[data-jam-ketemuan]')).toContainText('Besok · 20.00 WIB')
  await expect(hpBintang.getByText('Ada yang berubah')).toBeVisible(REALTIME)
  await expect(hpHaikal.getByText('Ada yang berubah')).toBeVisible(REALTIME)

  // Hapus jam: kembali dihitung untuk berangkat saat Cari tempat ditekan.
  await kartu.getByRole('button', { name: 'Ubah' }).click()
  await kartu.getByRole('button', { name: 'Hapus jam' }).click()
  await expect(kartu.locator('[data-jam-ketemuan]')).toContainText('Jam ketemuan belum diatur')
  await expect(kartu.getByRole('button', { name: 'Atur jam ketemuan' })).toBeVisible()
  expect(await jamDiBackend(kode)).toBeNull()
})

test('jam yang sudah lewat tidak bisa disimpan', async ({ page }) => {
  // Pukul 00.00 WIB hari ini selalu sudah lewat, kecuali di 5 menit pertama yang masih ditoleransi.
  test.skip(new Date(Date.now() + 7 * 3600_000).getUTCHours() === 0, 'Pukul 00.xx WIB, jam 00.00 hari ini belum lewat.')
  const { kode, haikal } = await roomBerdua()
  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, JSON.stringify(v)), [kode, haikal] as const)
  await page.goto(`/r/${kode}`)

  await page.getByRole('button', { name: 'Atur jam' }).click()
  const isian = page.locator('[data-isian-jam-ketemuan]')
  await isian.getByText('Hari ini', { exact: true }).click()
  await isian.getByLabel('Jam (WIB)').fill('00:00')
  await expect(isian).toContainText('Jam itu sudah lewat. Pilih jam lain.')
  await expect(isian.getByRole('button', { name: 'Simpan' })).toBeDisabled()

  await isian.getByRole('button', { name: 'Batal' }).click()
  await expect(barisJam(page)).toContainText('Jam ketemuan belum diatur')
  expect(await jamDiBackend(kode)).toBeNull()
})
