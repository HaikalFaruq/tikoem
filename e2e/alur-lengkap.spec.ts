import { expect, test, type Browser, type Page } from '@playwright/test'
import { PAKAI_LAYANAN_TIRUAN } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

/** Batas tunggu untuk perubahan dari HP lain yang datang lewat realtime. */
const REALTIME = { timeout: 15_000 }

/** Satu HP: konteks browser sendiri, jadi localStorage dan identitasnya terpisah dari HP lain. */
async function hp(browser: Browser, lokasi?: { latitude: number; longitude: number }): Promise<Page> {
  const konteks = await browser.newContext({
    ...(lokasi ? { geolocation: lokasi, permissions: ['geolocation'] } : {}),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const halaman = await konteks.newPage()
  // Tidak bergantung pada server peta di internet.
  await halaman.route('https://tiles.openfreemap.org/**', (rute) => rute.abort())
  return halaman
}

async function isiNamaDanKendaraan(halaman: Page, nama: string, kendaraan: string) {
  await halaman.getByLabel('Namamu').fill(nama)
  await halaman.getByText(kendaraan, { exact: true }).click()
}

test('alur lengkap: buat room, tiga orang gabung dari HP masing-masing, hasil keluar, lalu voting', async ({ browser }) => {
  test.setTimeout(120_000)

  // 1. Haikal membuat room di beranda.
  const haikal = await hp(browser, { latitude: -6.262, longitude: 106.813 })
  await haikal.goto('/')
  await isiNamaDanKendaraan(haikal, 'Haikal', 'Motor')
  await haikal.getByRole('button', { name: 'Buat room' }).click()
  await expect(haikal).toHaveURL(/\/r\/[23456789A-HJKMNP-Z]{6}$/)
  const link = await haikal.getByLabel('Link room').inputValue()

  // 2. Bintang membuka link dari grup, gabung, lalu berbagi lokasi lewat GPS.
  const bintang = await hp(browser, { latitude: -6.226, longitude: 106.858 })
  await bintang.goto(new URL(link).pathname)
  await expect(bintang.getByText('Haikal mengajakmu mencari tempat ketemuan.', { exact: false })).toBeVisible()
  await isiNamaDanKendaraan(bintang, 'Bintang', 'Mobil')
  await bintang.getByRole('button', { name: 'Gabung' }).click()
  await bintang.getByRole('button', { name: 'Pakai lokasiku sekarang' }).click()
  await expect(bintang.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible()

  // 3. Umar tidak memberi izin GPS, jadi mengetik alamat.
  const umar = await hp(browser)
  await umar.goto(new URL(link).pathname)
  await isiNamaDanKendaraan(umar, 'Umar', 'Jalan kaki')
  await umar.getByRole('button', { name: 'Gabung' }).click()
  await umar.getByLabel('Ketik alamat atau nama tempat').fill('Kota Kasablanka')
  await umar.getByRole('button', { name: 'Cari', exact: true }).click()
  await umar.getByRole('button', { name: /^Kota Kasablanka, Menteng Dalam/ }).click()
  await expect(umar.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible()

  // 4. Haikal berbagi lokasi terakhir, melihat semua siap, lalu mencari tempat.
  await haikal.getByRole('button', { name: 'Pakai lokasiku sekarang' }).click()
  await expect(haikal.getByText('3 dari 3 orang sudah berbagi lokasi', { exact: false })).toBeVisible(REALTIME)
  await expect(haikal.getByText('Semua sudah siap.')).toBeVisible()
  await haikal.getByRole('button', { name: 'Cari tempat' }).click()

  // 5. Hasil yang sama muncul di ketiga HP, dengan waktu tempuh ketiga orang.
  for (const halaman of [haikal, bintang, umar]) {
    await expect(halaman.getByRole('heading', { name: 'Tempat paling adil' })).toBeVisible({ timeout: 30_000 })
    await expect(halaman.locator('[data-kandidat]')).toHaveCount(5)
    await expect(halaman.locator('[data-kandidat="1"]').getByRole('list', { name: 'Waktu tempuh tiap orang' }).getByRole('listitem')).toHaveCount(3)
  }
  const namaTeradil = await haikal.locator('[data-kandidat="1"] h3').innerText()
  await expect(umar.locator('[data-kandidat="1"] h3')).toHaveText(namaTeradil)

  // 6. Voting dari tiap HP, dan semua HP melihat hitungan yang sama.
  await bintang.locator('[data-kandidat="2"]').getByRole('button', { name: 'Pilih tempat ini' }).click()
  await umar.locator('[data-kandidat="2"]').getByRole('button', { name: 'Pilih tempat ini' }).click()
  await haikal.locator('[data-kandidat="1"]').getByRole('button', { name: 'Pilih tempat ini' }).click()
  for (const halaman of [haikal, bintang, umar]) {
    await expect(halaman.locator('[data-kandidat="2"]')).toContainText('2 suara', REALTIME)
    await expect(halaman.locator('[data-kandidat="1"]')).toContainText('1 suara', REALTIME)
    await expect(halaman.getByText('3 dari 3 orang sudah memilih.')).toBeVisible(REALTIME)
  }
  await expect(umar.locator('[data-kandidat="2"]')).toContainText('Pilihanmu')
  await expect(haikal.locator('[data-kandidat="1"]')).toContainText('Pilihanmu')
})
