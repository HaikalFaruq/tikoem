import { expect, test, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { LOKASI_LAYANAN_GAGAL, LOKASI_TANPA_TEMPAT, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

const convex = new ConvexHttpClient(URL_BACKEND)
/**
 * Batas tunggu untuk perubahan yang datang lewat realtime dari HP lain. Saat semua E2E jalan paralel di satu backend lokal,
 * pembaruan kadang datang lebih lambat dari batas bawaan 5 detik.
 */
const REALTIME = { timeout: 15_000 }
type Identitas = { pesertaId: string; kunci: string }

async function masukSebagai(page: Page, kode: string, identitas: Identitas) {
  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, JSON.stringify(v)), [kode, identitas] as const)
  await page.goto(`/r/${kode}`)
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
  return { kode: haikal.kode, haikal, bintang, umar }
}

async function cariTempat(page: Page) {
  await page.getByRole('button', { name: 'Cari tempat' }).click()
  await expect(page.getByRole('heading', { name: 'Tempat paling adil' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-kandidat]')).toHaveCount(5)
}

test('tombol Cari tempat menunggu minimal 2 orang berbagi lokasi', async ({ page }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.2, lng: 106.85 } })
  await masukSebagai(page, haikal.kode, haikal)

  await expect(page.getByText('Tempat bisa dicari setelah minimal 2 orang berbagi lokasi.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cari tempat' })).toBeDisabled()

  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: { lat: -6.25, lng: 106.8 } })
  await expect(page.getByRole('button', { name: 'Cari tempat' })).toBeEnabled(REALTIME)
})

test('cari tempat, lalu voting yang langsung terlihat di HP lain', async ({ page }) => {
  const { kode, haikal, umar } = await roomBertiga()
  await masukSebagai(page, kode, haikal)
  await expect(page.getByText('Semua sudah siap.')).toBeVisible()
  await cariTempat(page)

  const pertama = page.locator('[data-kandidat="1"]')
  await expect(pertama).toContainText('#1 paling adil')
  await expect(pertama.getByRole('list', { name: 'Waktu tempuh tiap orang' }).getByRole('listitem')).toHaveCount(3)
  await expect(pertama).toContainText('Kamu')
  await expect(pertama).toContainText('Terlama')

  const kedua = page.locator('[data-kandidat="2"]')
  await kedua.getByRole('button', { name: 'Pilih tempat ini' }).click()
  await expect(kedua).toContainText('Pilihanmu')
  await expect(kedua).toContainText('1 suara')
  await expect(page.getByText('1 dari 3 orang sudah memilih.')).toBeVisible()

  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  await convex.mutation(api.room.vote, { pesertaId: umar.pesertaId, kunci: umar.kunci, kandidatId: hasil.kandidat[1].id })
  await expect(kedua).toContainText('2 suara', REALTIME)
  await expect(page.getByText('2 dari 3 orang sudah memilih.')).toBeVisible()

  await kedua.getByRole('button', { name: 'Batalkan pilihan' }).click()
  await expect(kedua).toContainText('1 suara')
  await expect(kedua).not.toContainText('Pilihanmu')

  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})

test('lokasi yang berubah membuat hasil usang, dan hitung ulang mengosongkan pilihan', async ({ page }) => {
  const { kode, haikal, umar } = await roomBertiga()
  await masukSebagai(page, kode, haikal)
  await cariTempat(page)
  await page.locator('[data-kandidat="1"]').getByRole('button', { name: 'Pilih tempat ini' }).click()
  await expect(page.locator('[data-kandidat="1"]')).toContainText('1 suara')

  await convex.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: { lat: -6.17, lng: 106.89 } })
  await expect(page.getByText('Ada lokasi yang berubah')).toBeVisible(REALTIME)

  await page.getByRole('button', { name: 'Hitung ulang' }).click()
  await expect(page.getByText('Ada lokasi yang berubah')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('[data-kandidat]')).toHaveCount(5)
  await expect(page.getByText('0 dari 3 orang sudah memilih.')).toBeVisible()
})

test('orang yang sudah keluar tidak lagi tampil di waktu tempuh kartu tempat', async ({ page }) => {
  const { kode, haikal, umar } = await roomBertiga()
  await masukSebagai(page, kode, haikal)
  await cariTempat(page)
  const baris = page.locator('[data-kandidat="1"]').getByRole('list', { name: 'Waktu tempuh tiap orang' }).getByRole('listitem')
  await expect(baris).toHaveCount(3)

  await convex.mutation(api.room.keluar, { pesertaId: umar.pesertaId, kunci: umar.kunci })
  await expect(baris).toHaveCount(2, REALTIME)
  await expect(page.locator('[data-kandidat="1"]')).not.toContainText('Umar')
})

for (const [nama, titik, pesan] of [
  ['tidak ada tempat di sekitar titik tengah', LOKASI_TANPA_TEMPAT, 'Tidak ada kafe, resto, atau mal di sekitar titik tengah.'],
  ['layanan peta gagal', LOKASI_LAYANAN_GAGAL, 'Layanan peta sedang gangguan'],
] as const) {
  test(`pencarian gagal karena ${nama}: pin kaget, pesan, dan tombol coba lagi`, async ({ page }) => {
    const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
    const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
    // Dua lokasi yang sama persis membuat titik tengahnya tepat di titik yang membuat layanan tiruan gagal.
    for (const p of [haikal, umar]) await convex.mutation(api.room.kirimLokasi, { pesertaId: p.pesertaId, kunci: p.kunci, lokasi: titik })
    await masukSebagai(page, haikal.kode, haikal)

    await page.getByRole('button', { name: 'Cari tempat' }).click()
    await expect(page.getByText(pesan)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('main svg[data-ekspresi="kaget"]')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeEnabled()
    await expect(page.locator('[data-kandidat]')).toHaveCount(0)
  })
}
