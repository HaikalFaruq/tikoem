import { expect, test, type Browser, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { LOKASI_RUTE_GAGAL_SEKALI, LOKASI_TANPA_TRANSPORTASI_UMUM, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

test.skip(!PAKAI_LAYANAN_TIRUAN, 'Butuh layanan tiruan. Otomatis di CI, atau jalankan dengan E2E_LAYANAN_TIRUAN=1.')

// Dari Tetapkan sampai ringkasan rute di kartu Fix! (#78), dengan Transitous tiruan dari e2e/layanan-tiruan.ts.
const convex = new ConvexHttpClient(URL_BACKEND)
/** Batas tunggu untuk perubahan dari HP lain dan ringkasan rute yang dihitung di backend. */
const REALTIME = { timeout: 15_000 }
const MANGGARAI = { lat: -6.2105, lng: 106.8505 }
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

async function lihat(kode: string) {
  const hasil = await convex.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil
}

/** Haikal naik motor dari Pondok Indah, Sari dari `lokasiSari`. Tempatnya sudah dicari, tapi belum ditetapkan. */
async function roomSiap(lokasiSari: { lat: number; lng: number }, kendaraanSari: 'motor' | 'transportasi_umum' = 'transportasi_umum') {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const sari = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Sari', kendaraan: kendaraanSari })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: { lat: -6.262, lng: 106.813 } })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: sari.pesertaId, kunci: sari.kunci, lokasi: lokasiSari })
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  await expect.poll(async () => (await lihat(haikal.kode)).room.status, { timeout: 30_000 }).toBe('siap')
  return { kode: haikal.kode, haikal, sari }
}

async function tetapkanDari(halaman: Page) {
  const kartu = halaman.locator('[data-kartu-hasil]')
  await kartu.getByRole('button', { name: 'Tetapkan tempat ini' }).click()
  await halaman.getByRole('dialog').getByRole('button', { name: 'Tetapkan', exact: true }).click()
  await expect(kartu).toHaveAttribute('data-tetap', '', REALTIME)
  return kartu
}

test('kartu Fix!: ringkasan rute untuk yang naik transportasi umum, lalu jam berangkat setelah jam ketemuan diisi', async ({ browser }) => {
  test.setTimeout(90_000)
  const { kode, haikal, sari } = await roomSiap(MANGGARAI)
  const hpSari = await hp(browser, kode, sari)
  const kartu = await tetapkanDari(hpSari)
  const perjalanan = kartu.locator('[data-perjalanan-saya]')

  // Tanpa jam ketemuan: langkah dan lamanya saja, tanpa jam, ditambah ajakan mengisi jam.
  await expect(perjalanan).toContainText('Sekitar 21 menit perjalanan.', REALTIME)
  await expect(perjalanan).toContainText('Atur jam ketemuan di atas supaya tahu kapan harus berangkat.')
  const langkah = perjalanan.locator('[data-langkah]')
  await expect(langkah).toHaveCount(3)
  await expect(langkah.nth(0)).toHaveText('Jalan 5 menit ke Stasiun Tiruan')
  await expect(langkah.nth(1)).toContainText('Commuter Line Tiruan')
  await expect(langkah.nth(1)).toContainText('arah Tiruan Baru')
  await expect(langkah.nth(1)).toContainText('Naik di Stasiun Tiruan, turun di Stasiun Tiruan Baru')
  await expect(langkah.nth(1)).toContainText('lewat 2 stasiun · 12 menit')
  await expect(langkah.nth(2)).toHaveText('Jalan 4 menit ke tempat')
  // Warna jalur dari feed.
  await expect(langkah.nth(1).locator('[data-chip-jalur]')).toHaveCSS('background-color', 'rgb(227, 10, 22)')
  await expect(perjalanan).toContainText('Rute ini belum memakai MRT dan LRT.')

  // Jam ketemuan dari kartu Fix!: ringkasannya dihitung ulang supaya sampai paling lambat jam itu.
  await kartu.getByRole('button', { name: 'Atur jam ketemuan' }).click()
  await kartu.locator('[data-isian-jam-ketemuan]').getByText('Besok', { exact: true }).click()
  await kartu.getByLabel('Jam (WIB)').fill('19:00')
  await kartu.getByRole('button', { name: 'Simpan' }).click()
  await expect(perjalanan).toContainText('Berangkat paling lambat 18.39, sampai 19.00.', REALTIME)
  await expect(langkah.nth(1)).toContainText('Naik di Stasiun Tiruan (18.44), turun di Stasiun Tiruan Baru')
  await expect(perjalanan).not.toContainText('Atur jam ketemuan di atas')

  // Haikal naik motor: perkiraan jam berangkat dari waktu tempuhnya, dengan cadangan macet. Rute Sari tidak tampil di sini.
  const { kandidat, room } = await lihat(kode)
  const menitHaikal = kandidat.find((k) => k.id === room.tetap?.kandidatId)!.waktuTempuh.find((w) => w.pesertaId === haikal.pesertaId)!.menit
  const berangkat = new Date(room.jamKetemuan!.waktu - (menitHaikal + 10) * 60_000 + 7 * 3600_000).toISOString().slice(11, 16).replace(':', '.')
  const hpHaikal = await hp(browser, kode, haikal)
  const perjalananHaikal = hpHaikal.locator('[data-perjalanan-saya]')
  await expect(perjalananHaikal).toContainText(`Berangkat sekitar ${berangkat}, sudah termasuk 10 menit untuk macet.`)
  await expect(hpHaikal.locator('[data-langkah]')).toHaveCount(0)

  await hpSari.setViewportSize({ width: 320, height: 640 })
  expect(await hpSari.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

  // Ubah lagi: ringkasannya dihapus bersama keadaan Fix!.
  await hpSari.getByRole('button', { name: 'Ubah lagi' }).click()
  await expect(hpSari.locator('[data-perjalanan-saya]')).toHaveCount(0, REALTIME)
})

test('ringkasan rute yang gagal bisa dicoba lagi dari kartu Fix!', async ({ browser }) => {
  // Transitous tiruan gagal sekali per titik, jadi titiknya digeser dari yang dipakai e2e/ringkasan-rute.spec.ts.
  const { kode, sari } = await roomSiap({ lat: LOKASI_RUTE_GAGAL_SEKALI.lat + 0.004, lng: LOKASI_RUTE_GAGAL_SEKALI.lng + 0.004 })
  const hpSari = await hp(browser, kode, sari)
  const perjalanan = (await tetapkanDari(hpSari)).locator('[data-perjalanan-saya]')
  await expect(perjalanan).toContainText('Rute transportasi umummu belum bisa dicari', REALTIME)
  await perjalanan.getByRole('button', { name: 'Coba lagi' }).click()
  await expect(perjalanan.locator('[data-langkah]')).toHaveCount(3, REALTIME)
})

test('tanpa rute transportasi umum dari lokasinya, kartu Fix! mengajak mengatur jam lain', async ({ browser }) => {
  // Sari naik motor saat tempat dicari, lalu beralih ke transportasi umum dan pindah ke Cileungsi setelah tempatnya ditetapkan.
  const { kode, sari } = await roomSiap(MANGGARAI, 'motor')
  const hpSari = await hp(browser, kode, sari)
  const perjalanan = (await tetapkanDari(hpSari)).locator('[data-perjalanan-saya]')
  await expect(perjalanan).toContainText('Atur jam ketemuan di atas supaya tahu kapan harus berangkat.')
  await convex.mutation(api.room.ubahKendaraan, { pesertaId: sari.pesertaId, kunci: sari.kunci, kendaraan: 'transportasi_umum' })
  await convex.mutation(api.room.kirimLokasi, { pesertaId: sari.pesertaId, kunci: sari.kunci, lokasi: LOKASI_TANPA_TRANSPORTASI_UMUM })
  await expect(perjalanan).toContainText('Belum ada rute KRL atau TransJakarta dari lokasimu kalau berangkat sekarang.', REALTIME)
})
