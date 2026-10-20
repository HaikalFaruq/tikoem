import { expect, test, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { LOKASI_LAYANAN_GAGAL, LOKASI_TANPA_TEMPAT, LOKASI_TIDAK_TERJANGKAU, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

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
  // Pop up traktir muncul sekali per room saat tempat mulai dicari (e2e/traktir.spec.ts).
  await page.getByRole('dialog', { name: 'Traktir Tikoem kopi?' }).getByRole('button', { name: 'Tutup' }).click()
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

test('kartu hasil: tempat paling adil dulu, ikut suara terbanyak, siap dikirim ke grup', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const { kode, haikal, bintang, umar } = await roomBertiga()
  await masukSebagai(page, kode, haikal)
  await cariTempat(page)

  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  const [pertama, , ketiga] = hasil.kandidat

  const kartu = page.locator('[data-kartu-hasil]')
  await expect(kartu).toContainText(pertama.nama)
  await expect(kartu).toContainText('Belum ada yang memilih, jadi ini yang paling adil')
  // Momen gabung diputar sekali untuk hasil ini di HP ini.
  await expect(kartu).toHaveAttribute('data-momen', 'main')

  const wa = kartu.getByRole('link', { name: 'Kirim hasil ke grup WA' })
  const pesan = new URL((await wa.getAttribute('href'))!).searchParams.get('text')!
  expect(pesan).toContain(`Ketemuan di *${pertama.nama}*`)
  expect(pesan).toContain(`Terlama ${pertama.terlamaMenit} mnt.`)
  expect(pesan.endsWith(`/r/${kode}`)).toBe(true)

  // Rute dari lokasi HP sendiri. Haikal naik motor, jadi mode mobil, dan lokasi asalnya tidak ikut di link.
  const rute = new URL((await kartu.getByRole('link', { name: 'Lihat rute ke sana' }).getAttribute('href'))!)
  expect(rute.searchParams.get('destination')).toBe(`${pertama.lokasi.lat},${pertama.lokasi.lng}`)
  expect(rute.searchParams.get('travelmode')).toBe('driving')
  expect(rute.searchParams.get('origin')).toBeNull()

  for (const p of [bintang, umar]) await convex.mutation(api.room.vote, { pesertaId: p.pesertaId, kunci: p.kunci, kandidatId: ketiga.id })
  await expect(kartu).toContainText(ketiga.nama, REALTIME)
  await expect(kartu).toContainText('Dipilih 2 dari 3 orang')

  await kartu.getByRole('button', { name: 'Salin teks hasil' }).click()
  await expect(kartu.getByRole('button', { name: 'Tersalin' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Ketemuan di *${ketiga.nama}*`)

  await page.reload()
  await expect(page.locator('[data-kartu-hasil]')).toContainText(ketiga.nama)
  await expect(page.locator('[data-kartu-hasil]')).not.toHaveAttribute('data-momen', 'main')
})
test('tetapkan tempat: konfirmasi, keadaan Fix! untuk semua, lalu Ubah lagi membuka voting', async ({ page }) => {
  const { kode, haikal, bintang, umar } = await roomBertiga()
  await masukSebagai(page, kode, haikal)
  await cariTempat(page)
  const namaPertama = await page.locator('[data-kandidat="1"] h3').innerText()
  const kartu = page.locator('[data-kartu-hasil]')

  // Batal tidak mengubah apa pun.
  await kartu.getByRole('button', { name: 'Tetapkan tempat ini' }).click()
  const dialog = page.getByRole('dialog', { name: `Tetapkan ${namaPertama} untuk semua orang?` })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Batal' }).click()
  await expect(dialog).toBeHidden()
  await expect(kartu).not.toHaveAttribute('data-tetap')

  await kartu.getByRole('button', { name: 'Tetapkan tempat ini' }).click()
  await dialog.getByRole('button', { name: 'Tetapkan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tempatnya sudah fix' })).toBeVisible(REALTIME)
  await expect(kartu).toHaveAttribute('data-tetap', '')
  await expect(kartu).toContainText('Fix! Ketemuan di')
  await expect(kartu).toContainText(namaPertama)
  await expect(kartu).toContainText('Ditetapkan olehmu')
  // Momen gabung diputar lagi untuk "Fix!".
  await expect(kartu).toHaveAttribute('data-momen', 'main')
  // Kartu tempat lain, voting, dan tombol Tetapkan disembunyikan.
  await expect(page.locator('[data-kandidat]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tetapkan tempat ini' })).toHaveCount(0)
  const pesan = new URL((await kartu.getByRole('link', { name: 'Kirim hasil ke grup WA' }).getAttribute('href'))!).searchParams.get('text')!
  expect(pesan.startsWith(`Fix! Ketemuan di *${namaPertama}*`)).toBe(true)
  expect(pesan.endsWith(`/r/${kode}`)).toBe(true)

  // Lokasi yang berubah tidak memunculkan Hitung ulang selama tempatnya tetap.
  await convex.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: { lat: -6.17, lng: 106.89 } })
  await page.waitForTimeout(1000)
  await expect(page.getByText('Ada lokasi yang berubah')).toHaveCount(0)

  await page.getByRole('button', { name: 'Ubah lagi' }).click()
  await expect(page.getByRole('heading', { name: 'Tempat paling adil' })).toBeVisible(REALTIME)
  await expect(page.locator('[data-kandidat]')).toHaveCount(5)
  await expect(kartu).not.toHaveAttribute('data-tetap')

  // Ditetapkan dari HP lain: langsung berubah di sini, dengan nama orangnya.
  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  await convex.mutation(api.room.tetapkan, { pesertaId: bintang.pesertaId, kunci: bintang.kunci, kandidatId: hasil.kandidat[0].id })
  await expect(kartu).toContainText('Ditetapkan oleh Bintang', REALTIME)

  // Kalau Bintang keluar, tempatnya tetap berlaku tanpa nama.
  await convex.mutation(api.room.keluar, { pesertaId: bintang.pesertaId, kunci: bintang.kunci })
  await expect(kartu).not.toContainText('Bintang', REALTIME)
  await expect(kartu).toContainText('Ditetapkan')

  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})

test('tetapkan ditolak kalau suara terbanyak berubah saat dialog konfirmasi terbuka', async ({ page }) => {
  const { kode, haikal, bintang, umar } = await roomBertiga()
  await masukSebagai(page, kode, haikal)
  await cariTempat(page)
  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  const [pertama, , ketiga] = hasil.kandidat

  const kartu = page.locator('[data-kartu-hasil]')
  await kartu.getByRole('button', { name: 'Tetapkan tempat ini' }).click()
  const dialog = page.getByRole('dialog', { name: `Tetapkan ${pertama.nama} untuk semua orang?` })
  await expect(dialog).toBeVisible()

  for (const p of [bintang, umar]) await convex.mutation(api.room.vote, { pesertaId: p.pesertaId, kunci: p.kunci, kandidatId: ketiga.id })
  await expect(kartu).toContainText(ketiga.nama, REALTIME)
  // Dialognya tetap menanyakan tempat yang tadi.
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Tetapkan', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Suara terbanyak baru saja berubah. Cek lagi kartunya.')
  await expect(kartu).not.toHaveAttribute('data-tetap')
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

test('pencarian gagal karena lokasi seseorang di laut: pesannya menyebut orang itu', async ({ page }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.226, lng: 106.858 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: LOKASI_TIDAK_TERJANGKAU })
  await masukSebagai(page, haikal.kode, haikal)

  await page.getByRole('button', { name: 'Cari tempat' }).click()
  await expect(page.getByText('Lokasi Umar terlalu jauh dari jalan')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Minta Umar memperbarui lokasinya')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeEnabled()

  // Di HP Umar, pesannya ditujukan ke dia sendiri.
  await masukSebagai(page, haikal.kode, umar)
  await expect(page.getByText('Lokasimu terlalu jauh dari jalan')).toBeVisible(REALTIME)
})
