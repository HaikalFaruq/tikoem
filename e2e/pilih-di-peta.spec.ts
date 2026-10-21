import { expect, test, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { LOKASI_LAYANAN_GAGAL, LOKASI_TIDAK_TERJANGKAU, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

const convex = new ConvexHttpClient(URL_BACKEND)
const REALTIME = { timeout: 15_000 }
const LABEL_TIRUAN = 'Tempat Tiruan, Jl. Tiruan Raya, Tebet Timur, Jakarta Selatan'
const TEBET = { lat: -6.226, lng: 106.858 }

// Peta dasar sengaja gagal supaya tidak bergantung internet. Pin di tengah dan geser peta tetap jalan.
test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (rute) => rute.abort())
})

/** Room dengan Haikal di `lokasiHaikal`, lalu Gita gabung dari layar tanpa lokasi. */
async function gabungSetelahHaikal(page: Page, lokasiHaikal: { lat: number; lng: number }) {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: lokasiHaikal })
  await page.goto(`/r/${haikal.kode}`)
  await page.getByLabel('Namamu').fill('Gita')
  await page.getByRole('button', { name: 'Gabung' }).click()
  await page.getByRole('button', { name: 'Pilih titik di peta' }).click()
  return haikal.kode
}

async function lokasiGita(kode: string) {
  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil.peserta.find((p) => p.nama === 'Gita')?.lokasi ?? null
}

test('pilih titik di peta: mulai dari lokasi teman, alamat di bawah pin, geser, lalu pakai titiknya', async ({ page }) => {
  const kode = await gabungSetelahHaikal(page, TEBET)
  const label = page.locator('[data-label-titik]')
  await expect(label).toHaveText(LABEL_TIRUAN, REALTIME)

  // Geser peta ke kiri, jadi titik di ujung pin pindah ke timur.
  const peta = await page.locator('[data-peta-pilih] canvas').boundingBox()
  if (!peta) throw new Error('Peta tidak tampil')
  const tengah = { x: peta.x + peta.width / 2, y: peta.y + peta.height / 2 }
  await page.mouse.move(tengah.x, tengah.y)
  await page.mouse.down()
  await page.mouse.move(tengah.x - 60, tengah.y, { steps: 6 })
  await expect(page.locator('[data-peta-pilih]')).toHaveAttribute('data-peta-pilih', 'bergerak')
  await expect(page.getByRole('button', { name: 'Pakai titik ini' })).toBeDisabled()
  await page.mouse.move(tengah.x - 150, tengah.y, { steps: 6 })
  // Diam sebentar sebelum dilepas, supaya peta berhenti tanpa meluncur (inersia).
  await page.waitForTimeout(400)
  await page.mouse.up()
  await expect(label).toHaveText(LABEL_TIRUAN, REALTIME)

  await page.getByRole('button', { name: 'Pakai titik ini' }).click()
  await expect(page.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible(REALTIME)
  await expect(page.locator('[data-pilih-di-peta]')).toHaveCount(0)
  const lokasi = await lokasiGita(kode)
  expect(lokasi).not.toBeNull()
  // Di zoom 15, 150 px sekitar 500 m ke timur. Lokasinya juga disamarkan sekitar 110 m.
  expect(lokasi!.lng).toBeGreaterThan(TEBET.lng + 0.002)
  expect(Math.abs(lokasi!.lat - TEBET.lat)).toBeLessThan(0.003)

  // Yang lokasinya sudah masuk juga bisa memperbaruinya lewat peta, atau batal.
  await page.getByRole('button', { name: 'Pilih di peta' }).click()
  await expect(page.locator('[data-pilih-di-peta]')).toBeVisible()
  await page.locator('[data-pilih-di-peta]').getByRole('button', { name: 'Batal' }).click()
  await expect(page.locator('[data-pilih-di-peta]')).toHaveCount(0)

  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})

test('titik di laut tidak bisa dipakai, dengan pesan untuk menggeser pin ke dekat jalan', async ({ page }) => {
  await gabungSetelahHaikal(page, LOKASI_TIDAK_TERJANGKAU)
  await expect(page.locator('[data-label-titik]')).toContainText('Titik ini jauh dari jalan', REALTIME)
  await expect(page.getByRole('button', { name: 'Pakai titik ini' })).toBeDisabled()
})

test('alamat gagal dicari: labelnya kosong, tapi titiknya tetap bisa dipakai', async ({ page }) => {
  const kode = await gabungSetelahHaikal(page, LOKASI_LAYANAN_GAGAL)
  await expect(page.locator('[data-label-titik]')).toContainText('Alamatnya belum bisa ditampilkan', REALTIME)
  await page.getByRole('button', { name: 'Pakai titik ini' }).click()
  await expect(page.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible(REALTIME)
  expect(await lokasiGita(kode)).not.toBeNull()
})

test('lokasi yang terlalu jauh dari jalan diberi tahu di kartu lokasi orang itu, sampai diperbarui', async ({ page }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: TEBET })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: LOKASI_TIDAK_TERJANGKAU })
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  // Halaman dibuka setelah pencarian selesai, supaya pop up traktir (muncul saat pencarian berjalan) tidak menutupi layar.
  await expect
    .poll(async () => {
      const hasil = await convex.query(api.room.lihat, { kode: haikal.kode })
      return hasil.ok ? hasil.room.status : null
    }, { timeout: 30_000 })
    .toBe('gagal')

  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, JSON.stringify(v)), [haikal.kode, umar] as const)
  await page.goto(`/r/${haikal.kode}`)
  await expect(page.getByRole('heading', { name: 'Lokasimu terlalu jauh dari jalan' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Pilih titik di peta' })).toBeVisible()

  // Diperbarui lewat alamat: kartunya kembali biasa, dan Coba lagi bisa ditekan.
  await page.getByRole('button', { name: 'Pakai alamat' }).click()
  await page.getByLabel('Ketik alamat atau nama tempat').fill('Kota Kasablanka')
  await page.getByRole('button', { name: 'Cari', exact: true }).click()
  await page.getByRole('button', { name: /^Kota Kasablanka, Menteng Dalam/ }).click()
  await expect(page.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible(REALTIME)
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeEnabled()

  // Backend tidak lagi menyebut Umar, jadi peringatannya tidak muncul lagi setelah halaman dimuat ulang.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible(REALTIME)
  await expect(page.getByText('Lokasi yang tadi terlalu jauh dari jalan sudah berubah')).toBeVisible()
})
