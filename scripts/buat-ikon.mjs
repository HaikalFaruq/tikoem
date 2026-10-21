// Membuat ikon PWA dan gambar pratinjau link (Open Graph) dari SVG, lewat Chromium milik Playwright.
// Jalankan ulang setelah identitas visual berubah: `npm run ikon`. Hasilnya ditulis ke public/ dan ikut di-commit.
// Logo: B untuk ikon dan favicon, C untuk ilustrasi og.png (Discussions #61, gambar di docs/desain/logo/).
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
const pinStiker = (x, y, skala, isi, putar = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${putar}) scale(${skala})"><path d="${PIN}" transform="translate(2.2 2.2)" fill="${TINTA}"/><path d="${PIN}" fill="${isi}" stroke="${TINTA}" stroke-width="3" stroke-linejoin="round"/>${wajah}</g>`

/** Bintang stiker berujung delapan, berpusat di (x, y) dengan jari-jari 18 × skala. */
const bintangStiker = (x, y, skala) =>
  `<g transform="translate(${x} ${y}) scale(${skala})"><path d="${BINTANG_8}" transform="translate(1.6 1.6)" fill="${TINTA}"/><path d="${BINTANG_8}" fill="${BINTANG}" stroke="${TINTA}" stroke-width="2.6" stroke-linejoin="round"/></g>`

/** Logo B: pin putih dengan bintang menempel di pojok kanan atas kepalanya. Ujung pin di (x, y). */
const pinBintang = (x, y, skala) => pinStiker(x, y, skala, '#FFFFFF') + bintangStiker(Math.round(x + 18.9 * skala), Math.round(y - 38.9 * skala), skala / 2)

/** Ikon biasa: kotak merah membulat, untuk layar pemasangan, tab browser, dan favicon. */
const ikonBiasa = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="16" y="16" width="480" height="480" rx="112" fill="${MERAH}" stroke="${TINTA}" stroke-width="16"/>${pinBintang(236, 430, 7.2)}</svg>`

/**
 * Ikon penuh untuk Android (maskable) dan iOS: latar sampai tepi. Pin dan bintangnya diperkecil supaya seluruhnya,
 * termasuk ujung bintang, masuk lingkaran aman berjari-jari 40% di tengah (paling jauh sekitar 175 dari 205 px).
 */
const ikonPenuh = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${MERAH}"/>${pinBintang(246, 396, 5.6)}</svg>`

async function fontDataUri(berkas) {
  return `data:font/woff2;base64,${(await readFile(new URL(`../node_modules/${berkas}`, import.meta.url))).toString('base64')}`
}

/** Gambar pratinjau link room di WhatsApp dan media sosial, 1200 x 630. */
async function halamanOg() {
  const bricolage = await fontDataUri('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2')
  const figtree = await fontDataUri('@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2')
  // Logo C: dua pin dari kiri dan kanan, ujungnya bertemu di bintang. Dua teman kecil masih menyusul lewat jejak
  // titik-titik, supaya gambarnya terbaca sebagai kumpul ramai-ramai, bukan berdua saja.
  const temu = [905, 450]
  const jejak = [
    `M715 565 Q 790 560 ${temu[0] - 40} ${temu[1] + 20}`,
    `M1095 565 Q 1020 560 ${temu[0] + 40} ${temu[1] + 20}`,
  ]
  const menyusul = [
    [715, 565, '#4CC9A0'],
    [1095, 565, '#9B7BFF'],
  ]
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
      <g stroke="${TINTA}" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 20" fill="none" opacity="0.5">${jejak.map((d) => `<path d="${d}" />`).join('')}</g>
      ${pinStiker(temu[0], temu[1], 5.6, MERAH, -28)}
      ${pinStiker(temu[0], temu[1], 5.6, '#3D7BFF', 28)}
      ${bintangStiker(temu[0], temu[1] + 8, 2.8)}
      ${menyusul.map(([x, y, warna]) => pinStiker(x, y, 2.6, warna)).join('')}
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
await writeFile(`${akar}public/favicon.svg`, `${ikonBiasa}\n`)

await halaman.setViewportSize({ width: 1200, height: 630 })
await halaman.setContent(await halamanOg())
await halaman.evaluate(() => document.fonts.ready)
await writeFile(`${akar}public/og.png`, await halaman.screenshot())

await browser.close()
console.log('Ikon PWA, favicon.svg, dan og.png ditulis ke public/.')
