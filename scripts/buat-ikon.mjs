// Membuat ikon PWA dan gambar pratinjau link (Open Graph) dari SVG, lewat Chromium milik Playwright.
// Jalankan ulang setelah identitas visual berubah: `npm run ikon`. Hasilnya ditulis ke public/ dan ikut di-commit.
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const akar = fileURLToPath(new URL('..', import.meta.url))
const MERAH = '#FF5A36'
const TINTA = '#1B1A33'
const KERTAS = '#F2F4FF'
const BINTANG = '#FFC93C'

// Bentuk yang sama dengan src/ui/Pin.tsx: ujung pin di (0, 0), kepala berpusat di (0, -27).
const PIN = 'M0 0 C -5 -9 -17 -15 -17 -27 A17 17 0 1 1 17 -27 C 17 -15 5 -9 0 0 Z'
const BINTANG_8 =
  'M0 -18 L3.4 -8.3 L12.7 -12.7 L8.3 -3.4 L18 0 L8.3 3.4 L12.7 12.7 L3.4 8.3 L0 18 L-3.4 8.3 L-12.7 12.7 L-8.3 3.4 L-18 0 L-8.3 -3.4 L-12.7 -12.7 L-3.4 -8.3 Z'
const wajah = `<g transform="translate(0 -27)" stroke="${TINTA}" stroke-width="2.4" stroke-linecap="round" fill="none"><circle cx="-5.5" cy="-2" r="1.7" fill="${TINTA}"/><circle cx="5.5" cy="-2" r="1.7" fill="${TINTA}"/><path d="M-6 4 Q0 10 6 4"/></g>`

/** Pin stiker: bayangan keras, isi warna, outline tinta, dan wajah. */
const pinStiker = (x, y, skala, isi) =>
  `<g transform="translate(${x} ${y}) scale(${skala})"><path d="${PIN}" transform="translate(2.2 2.2)" fill="${TINTA}"/><path d="${PIN}" fill="${isi}" stroke="${TINTA}" stroke-width="3" stroke-linejoin="round"/>${wajah}</g>`

/** Ikon biasa: kotak merah membulat dengan pin putih, untuk layar pemasangan dan tab browser. */
const ikonBiasa = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="16" y="16" width="480" height="480" rx="112" fill="${MERAH}" stroke="${TINTA}" stroke-width="16"/>${pinStiker(250, 430, 7.6, '#FFFFFF')}</svg>`

/** Ikon penuh untuk Android (maskable) dan iOS: latar sampai tepi, pin di dalam lingkaran aman 80% di tengah. */
const ikonPenuh = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${MERAH}"/>${pinStiker(253, 392, 6, '#FFFFFF')}</svg>`

async function fontDataUri(berkas) {
  return `data:font/woff2;base64,${(await readFile(new URL(`../node_modules/${berkas}`, import.meta.url))).toString('base64')}`
}

/** Gambar pratinjau link room di WhatsApp dan media sosial, 1200 x 630. */
async function halamanOg() {
  const bricolage = await fontDataUri('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2')
  const figtree = await fontDataUri('@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2')
  const pin = [
    [615, 470, 1, MERAH],
    [800, 505, 2, '#3D7BFF'],
    [985, 470, 3, '#4CC9A0'],
  ]
  const garis = pin.map(([x, y]) => `<path d="M${x} ${y - 170} Q ${(x + 800) / 2} ${y - 230} 800 215" />`).join('')
  return `<!doctype html><html><head><style>
    @font-face { font-family: 'Bricolage'; src: url(${bricolage}) format('woff2'); font-weight: 200 800; }
    @font-face { font-family: 'Figtree'; src: url(${figtree}) format('woff2'); font-weight: 300 900; }
    html, body { margin: 0; }
    .kanvas { width: 1200px; height: 630px; background: ${KERTAS}; position: relative; overflow: hidden; font-family: 'Figtree', sans-serif; color: ${TINTA}; }
    .teks { position: absolute; left: 80px; top: 120px; width: 560px; }
    h1 { font-family: 'Bricolage', sans-serif; font-weight: 800; font-size: 150px; line-height: 1; margin: 0; letter-spacing: -0.05em; font-variation-settings: 'opsz' 96; text-shadow: 7px 7px 0 ${MERAH}; }
    .tagline { font-size: 46px; font-weight: 700; line-height: 1.15; margin: 36px 0 0; }
    .sub { font-size: 28px; line-height: 1.35; margin: 22px 0 0; color: #545372; }
    svg { position: absolute; inset: 0; }
  </style></head><body><div class="kanvas">
    <svg width="1200" height="630" viewBox="0 0 1200 630">
      <g stroke="${TINTA}" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 20" fill="none" opacity="0.5">${garis}</g>
      <g transform="translate(800 170) scale(3.2)"><path d="${BINTANG_8}" fill="${BINTANG}" stroke="${TINTA}" stroke-width="2.6" stroke-linejoin="round"/></g>
      ${pin.map(([x, y, , warna]) => pinStiker(x, y, 4.2, warna)).join('')}
    </svg>
    <div class="teks">
      <h1>tikoem</h1>
      <p class="tagline">Titik kumpul yang adil buat semua.</p>
      <p class="sub">Isi nama dan lokasimu. Tikoem carikan tempat yang waktu tempuhnya paling seimbang.</p>
    </div>
  </div></body></html>`
}

const browser = await chromium.launch()
const halaman = await browser.newPage()

async function render(svg, ukuran, berkas, transparan) {
  await halaman.setViewportSize({ width: ukuran, height: ukuran })
  await halaman.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${ukuran}" height="${ukuran}" `)}</body></html>`,
  )
  await writeFile(`${akar}public/${berkas}`, await halaman.screenshot({ omitBackground: transparan }))
}

await render(ikonBiasa, 64, 'pwa-64x64.png', true)
await render(ikonBiasa, 192, 'pwa-192x192.png', true)
await render(ikonBiasa, 512, 'pwa-512x512.png', true)
await render(ikonPenuh, 512, 'maskable-icon-512x512.png', false)
await render(ikonPenuh, 180, 'apple-touch-icon-180x180.png', false)

await halaman.setViewportSize({ width: 1200, height: 630 })
await halaman.setContent(await halamanOg())
await halaman.evaluate(() => document.fonts.ready)
await writeFile(`${akar}public/og.png`, await halaman.screenshot())

await browser.close()
console.log('Ikon PWA dan og.png ditulis ke public/.')
