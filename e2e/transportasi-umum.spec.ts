import { expect, test, type Browser, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { LOKASI_TANPA_TRANSPORTASI_UMUM, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

const convex = new ConvexHttpClient(URL_BACKEND)
const REALTIME = { timeout: 15_000 }
const SUMBER = 'https://transitous.org/sources/'
type Identitas = { pesertaId: string; kunci: string }

async function masukSebagai(browser: Browser, kode: string, identitas: Identitas) {
  const page = await browser.newPage()
  await page.goto('/')
  await page.evaluate(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, JSON.stringify(v)), [kode, identitas] as const)
  await page.goto(`/r/${kode}`)
  return page
}

async function statusRoom(kode: string) {
  const hasil = await convex.query(api.room.lihat, { kode })
  return hasil.ok ? hasil.room.status : null
}

/** Pop up traktir muncul sekali per room saat tempat mulai dicari (e2e/traktir.spec.ts). */
async function tutupTraktir(page: Page) {
  await page.getByRole('dialog', { name: 'Traktir Tikoem kopi?' }).getByRole('button', { name: 'Tutup' }).click()
}

test('alur lengkap dengan satu orang naik transportasi umum: pilihan, link Transitous, catatan, stasiun, dan rute', async ({
  page,
  context,
}) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.226, lng: 106.838 } })

  // Gita gabung lewat layar dan memilih Transportasi umum. Batas hitungan dan link sumber datanya langsung terlihat.
  await page.goto(`/r/${haikal.kode}`)
  await page.getByLabel('Namamu').fill('Gita')
  await expect(page.locator('[data-keterangan-transportasi-umum]')).toHaveCount(0)
  await page.getByText('Transportasi umum', { exact: true }).click()
  const keterangan = page.locator('[data-keterangan-transportasi-umum]')
  await expect(keterangan).toContainText('MRT dan LRT belum')
  await expect(keterangan.getByRole('link', { name: 'Transitous' })).toHaveAttribute('href', SUMBER)
  await page.getByRole('button', { name: 'Gabung' }).click()
  await expect(page.locator('li[data-urutan="2"]')).toContainText('Gita · kamu')
  await expect(page.locator('li[data-urutan="2"]')).toContainText('Transportasi umum')

  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -6.226, longitude: 106.878 })
  await page.getByRole('button', { name: 'Pakai lokasiku sekarang' }).click()
  await expect(page.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible(REALTIME)

  await page.getByRole('button', { name: 'Cari tempat' }).click()
  await tutupTraktir(page)
  await expect(page.getByRole('heading', { name: 'Tempat paling adil' })).toBeVisible({ timeout: 30_000 })

  // Catatan sekali di atas daftar tempat, dengan link ke sumber data Transitous.
  const catatan = page.locator('[data-catatan-transportasi-umum]')
  await expect(catatan).toHaveCount(1)
  await expect(catatan.getByRole('link', { name: 'Transitous' })).toHaveAttribute('href', SUMBER)

  // Stasiun dan halte sudah berawalan di namanya, jadi tidak diberi label kategori lagi.
  const kartuStasiun = page.locator('[data-kandidat]').filter({ hasText: /(Stasiun|Halte) Tiruan/ })
  await expect(kartuStasiun.first()).toBeVisible()
  await expect(kartuStasiun.first().locator('header p')).not.toContainText('Stasiun ·')
  await expect(page.locator('[data-stasiun-peta]').first()).toBeAttached()

  // Rute Gita di Google Maps memakai mode transportasi umum.
  await expect(page.locator('[data-kartu-hasil]').getByRole('link', { name: /rute/i })).toHaveAttribute('href', /travelmode=transit/)
})

test('tidak ada rute transportasi umum: kartu lokasi menawarkan ganti kendaraan, teman melihat namanya', async ({ browser }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const gita = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Gita', kendaraan: 'transportasi_umum' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.262, lng: 106.813 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: gita.pesertaId, kunci: gita.kunci, lokasi: LOKASI_TANPA_TRANSPORTASI_UMUM })
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  // Halaman dibuka setelah pencarian selesai, supaya pop up traktir tidak menutupi layar.
  await expect.poll(() => statusRoom(haikal.kode), { timeout: 30_000 }).toBe('gagal')

  const layarHaikal = await masukSebagai(browser, haikal.kode, haikal)
  await expect(layarHaikal.getByText('Belum ada rute transportasi umum dari lokasi Gita')).toBeVisible(REALTIME)

  const layarGita = await masukSebagai(browser, haikal.kode, gita)
  await expect(layarGita.getByRole('heading', { name: 'Belum ada rute transportasi umum dari lokasimu' })).toBeVisible(REALTIME)
  // Satu tombol merah: Ganti kendaraan. Coba lagi baru berguna setelah itu.
  const merah = layarGita.locator('button.bg-merah:visible, a.bg-merah:visible')
  await expect(merah).toHaveCount(1)
  await expect(merah).toHaveText('Ganti kendaraan')

  await merah.click()
  await layarGita.locator('[data-ganti-kendaraan]').getByText('Motor', { exact: true }).click()
  await layarGita.getByRole('button', { name: 'Simpan' }).click()
  await expect(layarGita.getByRole('heading', { name: 'Lokasimu sudah masuk' })).toBeVisible(REALTIME)
  await expect(layarHaikal.getByText('sudah mengganti lokasi atau kendaraannya')).toBeVisible(REALTIME)

  await layarHaikal.getByRole('button', { name: 'Coba lagi' }).click()
  await tutupTraktir(layarHaikal)
  await expect(layarHaikal.getByRole('heading', { name: 'Tempat paling adil' })).toBeVisible({ timeout: 30_000 })
})
