import { test, type Browser, type Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { mkdir, writeFile } from 'node:fs/promises'
import { api } from '../convex/_generated/api'
import { LOKASI_LAYANAN_GAGAL, PAKAI_LAYANAN_TIRUAN, URL_BACKEND } from './backend'

/**
 * Bukan test biasa: memotret layar-layar penting supaya bisa dicek sebelum push (docs/desain/cek-ux.md).
 * Jalankan dengan `npm run cek:layar`, lalu buka test-results/cek-layar/index.html.
 * Kalau menambah layar atau keadaan baru, tambahkan juga di sini.
 */
test.skip(!process.env.CEK_LAYAR || !PAKAI_LAYANAN_TIRUAN, 'Hanya lewat npm run cek:layar.')
test.describe.configure({ mode: 'serial' })

const convex = new ConvexHttpClient(URL_BACKEND)
const FOLDER = 'test-results/cek-layar'
const VARIAN = [
  { lebar: 320, tema: 'light' },
  { lebar: 320, tema: 'dark' },
  { lebar: 390, tema: 'light' },
  { lebar: 390, tema: 'dark' },
] as const
type Identitas = { pesertaId: string; kunci: string }
type Potretan = { keadaan: string; judul: string; berkas: string[] }
const semua: Potretan[] = []

type Opsi = {
  url: string
  /** Peserta yang membuka layar ini. Kosong berarti tamu. */
  sebagai?: { kode: string; identitas: Identitas }
  /** Pembuka (animasi splash) hanya diputar di keadaannya sendiri. */
  denganPembuka?: boolean
  /** Satu layar penuh dari atas sampai bawah, atau hanya yang terlihat pertama kali. */
  halamanPenuh?: boolean
  tunggu?: (halaman: Page) => Promise<void>
}

async function potret(browser: Browser, keadaan: string, judul: string, opsi: Opsi) {
  const berkas: string[] = []
  for (const { lebar, tema } of VARIAN) {
    const konteks = await browser.newContext({
      viewport: { width: lebar, height: 760 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: tema,
      locale: 'id-ID',
    })
    if (!opsi.denganPembuka) await konteks.addInitScript(() => sessionStorage.setItem('tikoem:pembuka', '1'))
    if (opsi.sebagai) {
      const { kode, identitas } = opsi.sebagai
      await konteks.addInitScript(([k, v]) => localStorage.setItem(`tikoem:peserta:${k}`, v), [kode, JSON.stringify(identitas)] as const)
    }
    const halaman = await konteks.newPage()
    await halaman.goto(opsi.url)
    await (opsi.tunggu ? opsi.tunggu(halaman) : halaman.waitForLoadState('networkidle'))
    const nama = `${keadaan}-${lebar}-${tema === 'light' ? 'terang' : 'gelap'}.png`
    await halaman.screenshot({ path: `${FOLDER}/${nama}`, fullPage: opsi.halamanPenuh ?? true })
    berkas.push(nama)
    await konteks.close()
  }
  semua.push({ keadaan, judul, berkas })
}

async function tungguStatus(kode: string, status: 'siap' | 'gagal') {
  for (let i = 0; i < 60; i++) {
    const hasil = await convex.query(api.room.lihat, { kode })
    if (hasil.ok && hasil.room.status === status) return hasil
    await new Promise((lanjut) => setTimeout(lanjut, 500))
  }
  throw new Error(`Room ${kode} tidak mencapai status ${status}`)
}

/** Haikal, Bintang, dan Umar dengan lokasi di tiga ujung Jakarta, seperti di E2E lain. */
async function roomBertiga() {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'jalan_kaki' })
  for (const [p, lokasi] of [
    [haikal, { lat: -6.262, lng: 106.813 }],
    [bintang, { lat: -6.226, lng: 106.858 }],
    [umar, { lat: -6.158, lng: 106.905 }],
  ] as const) {
    await convex.mutation(api.room.kirimLokasi, { pesertaId: p.pesertaId, kunci: p.kunci, lokasi })
  }
  return { kode: haikal.kode, haikal, bintang, umar }
}

/** Peta butuh sebentar untuk menggambar ubin dan pin. */
const petaSiap = async (halaman: Page) => {
  await halaman.waitForLoadState('networkidle')
  await halaman.waitForTimeout(1500)
}

test.beforeAll(async () => {
  await mkdir(FOLDER, { recursive: true })
})

test('pembuka', async ({ browser }) => {
  // Di tengah animasi: pin sudah menyatu dan wordmark sedang naik.
  await potret(browser, 'pembuka', 'Pembuka (splash), sekitar 1,2 detik', {
    url: '/',
    denganPembuka: true,
    halamanPenuh: false,
    tunggu: (halaman) => halaman.waitForTimeout(1200),
  })
})

test('beranda', async ({ browser }) => {
  await potret(browser, 'beranda', 'Beranda: buat room', { url: '/' })
})

test('room menunggu lokasi', async ({ browser }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  await potret(browser, 'room-menunggu', 'Room baru: belum ada yang berbagi lokasi', {
    url: `/r/${haikal.kode}`,
    sebagai: { kode: haikal.kode, identitas: haikal },
  })
})

test('room dengan peta', async ({ browser }) => {
  const { kode, haikal } = await roomBertiga()
  await potret(browser, 'room-peta', 'Tiga orang berbagi lokasi: peta dan tombol Cari tempat', {
    url: `/r/${kode}`,
    sebagai: { kode, identitas: haikal },
    tunggu: petaSiap,
  })
})

test('room dengan hasil', async ({ browser }) => {
  const { kode, haikal, bintang, umar } = await roomBertiga()
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  const hasil = await tungguStatus(kode, 'siap')
  // Dua suara di peringkat 2, supaya kartu hasil berbeda dari tempat paling adil.
  for (const p of [bintang, umar]) await convex.mutation(api.room.vote, { pesertaId: p.pesertaId, kunci: p.kunci, kandidatId: hasil.kandidat[1].id })
  await potret(browser, 'room-hasil', 'Hasil keluar: kartu hasil, kandidat, dan voting', {
    url: `/r/${kode}`,
    sebagai: { kode, identitas: haikal },
    tunggu: petaSiap,
  })
})

test('room gagal', async ({ browser }) => {
  const haikal = await convex.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const umar = await convex.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'motor' })
  for (const [p, geser] of [
    [haikal, 0],
    [umar, 0.01],
  ] as const) {
    const lokasi = { lat: LOKASI_LAYANAN_GAGAL.lat + geser, lng: LOKASI_LAYANAN_GAGAL.lng + geser }
    await convex.mutation(api.room.kirimLokasi, { pesertaId: p.pesertaId, kunci: p.kunci, lokasi })
  }
  await convex.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
  await tungguStatus(haikal.kode, 'gagal')
  await potret(browser, 'room-gagal', 'Pencarian gagal: layanan sedang bermasalah', {
    url: `/r/${haikal.kode}`,
    sebagai: { kode: haikal.kode, identitas: haikal },
    tunggu: petaSiap,
  })
})

test('room tidak ada', async ({ browser }) => {
  await potret(browser, 'room-tidak-ada', 'Link room yang salah atau sudah lama', { url: '/r/ZZZZZZ' })
})

test.afterAll(async () => {
  const kolom = VARIAN.map(({ lebar, tema }) => `<th>${lebar} px ${tema === 'light' ? 'terang' : 'gelap'}</th>`).join('')
  const baris = semua
    .map(
      ({ judul, berkas }) =>
        `<tr><th class="judul">${judul}</th>${berkas.map((b) => `<td><a href="${b}"><img src="${b}" alt="${judul}" loading="lazy" /></a></td>`).join('')}</tr>`,
    )
    .join('\n')
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8" /><title>Cek layar Tikoem</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #f2f4ff; color: #1b1a33; }
  table { border-collapse: separate; border-spacing: 12px; }
  th { text-align: left; font-size: 13px; }
  th.judul { width: 160px; vertical-align: top; font-size: 14px; }
  td { vertical-align: top; }
  img { width: 200px; border: 2px solid #1b1a33; border-radius: 12px; background: #fff; }
</style></head>
<body>
<h1>Cek layar Tikoem</h1>
<p>Nilai tiap layar dengan <code>docs/desain/cek-ux.md</code>. Klik gambar untuk ukuran penuh.</p>
<table><tr><th></th>${kolom}</tr>
${baris}
</table>
</body></html>
`
  await writeFile(`${FOLDER}/index.html`, html)
})
