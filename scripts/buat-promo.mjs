// Gambar promo di README (docs/gambar/promo-*.png, 1320×2868 seperti screenshot App Store).
// Masukannya tangkapan layar production yang sudah berbingkai iPhone 17 (bingkai-*.png, latar transparan, 1362×2724).
// Jalankan: npm run promo -- <folder tangkapan>
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const LEBAR = 1320
const TINGGI = 2868
const TINTA = '#1B1A33'
const WARNA = { merah: '#FF5A36', biru: '#3D7BFF', hijau: '#4CC9A0', kuning: '#FFC93C' }
const WARNA_PIN = { 1: '#FF5A36', 2: '#3D7BFF', 3: '#4CC9A0', 4: '#9B7BFF', 6: '#FF9F2E', 7: '#22C3D6' }

/** Judul ditulis per baris, kata di dalam [kurung] jadi chip stiker. Hiasan: pin berwajah atau bintang di pinggir kartu. */
const PANEL = [
  {
    nama: 'promo-1-buat-room',
    tangkapan: 'bingkai-1-buat-room.png',
    judul: ['Ketemuan yang [adil]', 'buat semua'],
    subjudul: 'Cukup nama. Motor, mobil, jalan kaki, atau transportasi umum.',
    warna: 'merah',
    hiasan: [
      { jenis: 'pin', warna: 2, x: 84, y: 1500, miring: -10 },
      { jenis: 'pin', warna: 3, x: 1100, y: 2060, miring: 8 },
    ],
  },
  {
    nama: 'promo-2-peta',
    tangkapan: 'bingkai-2-peta.png',
    judul: ['Semua teman', 'kelihatan di [peta]'],
    subjudul: 'Pin tiap orang, titik tengah, dan stasiun terdekat.',
    warna: 'biru',
    hiasan: [
      { jenis: 'bintang', x: 1070, y: 1360, miring: 10 },
      { jenis: 'pin', warna: 1, x: 84, y: 2240, miring: -8 },
    ],
  },
  {
    nama: 'promo-3-adil',
    tangkapan: 'bingkai-3-adil.png',
    judul: ['Adil itu soal [waktu],', 'bukan jarak'],
    subjudul: 'Paling atas: nggak ada yang jauh sendiri.',
    warna: 'hijau',
    hiasan: [
      { jenis: 'pin', warna: 4, x: 80, y: 1380, miring: -10 },
      { jenis: 'pin', warna: 6, x: 1100, y: 2320, miring: 8 },
    ],
  },
  {
    nama: 'promo-4-hasil',
    tangkapan: 'bingkai-4-hasil.png',
    judul: ['Tetapkan, lalu', '[kirim] ke grup'],
    subjudul: 'Satu tempat, semua tahu ke mana.',
    warna: 'kuning',
    hiasan: [
      { jenis: 'bintang', x: 1060, y: 1340, miring: -8 },
      { jenis: 'pin', warna: 7, x: 84, y: 2190, miring: -8 },
    ],
  },
]

const pin = (warna) => `
  <svg viewBox="-22 -54 44 58" width="150" height="198" overflow="visible">
    <path d="M0 0 C -5 -9 -17 -15 -17 -27 A17 17 0 1 1 17 -27 C 17 -15 5 -9 0 0 Z" fill="${WARNA_PIN[warna]}" stroke="${TINTA}" stroke-width="3" stroke-linejoin="round" />
    <g transform="translate(0 -27)" stroke="${TINTA}" stroke-width="2.2" stroke-linecap="round" fill="none">
      <circle cx="-5" cy="-2" r="1.7" fill="${TINTA}" /><circle cx="5" cy="-2" r="1.7" fill="${TINTA}" />
      <path d="M-5 4 Q0 10 5 4" />
    </g>
  </svg>`

const bintang = () => `
  <svg viewBox="-20 -20 40 40" width="200" height="200" overflow="visible">
    <path d="M0 -18 L3.4 -8.3 L12.7 -12.7 L8.3 -3.4 L18 0 L8.3 3.4 L12.7 12.7 L3.4 8.3 L0 18 L-3.4 8.3 L-12.7 12.7 L-8.3 3.4 L-18 0 L-8.3 -3.4 L-12.7 -12.7 L-3.4 -8.3 Z" fill="${WARNA.kuning}" stroke="${TINTA}" stroke-width="2.6" stroke-linejoin="round" />
  </svg>`

const judulHtml = (baris, warna) =>
  baris
    .map((b) => b.replace(/\[(.+?)\]/, `<span class="chip" style="background:${WARNA[warna]}">$1</span>`))
    .join('<br />')

async function dataUrl(berkas, jenis) {
  return `data:${jenis};base64,${(await readFile(berkas)).toString('base64')}`
}

async function halaman(panel, folder) {
  const fontJudul = await dataUrl('node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2', 'font/woff2')
  const fontTeks = await dataUrl('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', 'font/woff2')
  const ponsel = await dataUrl(join(folder, panel.tangkapan), 'image/png')
  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  @font-face { font-family: Bricolage; src: url(${fontJudul}) format('woff2-variations'); font-weight: 200 800; }
  @font-face { font-family: Figtree; src: url(${fontTeks}) format('woff2-variations'); font-weight: 300 900; }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${LEBAR}px; height: ${TINGGI}px; overflow: hidden; position: relative;
    background: #F2F4FF radial-gradient(circle, #C9CCE6 2.2px, transparent 2.6px) 0 0 / 44px 44px;
    color: ${TINTA};
  }
  h1 {
    position: absolute; top: 150px; inset-inline: 40px; text-align: center;
    font: 800 128px/1.12 Bricolage; font-variation-settings: 'opsz' 96; letter-spacing: -0.045em;
  }
  .chip {
    display: inline-block; padding: 0 26px 6px; margin: 0 6px; border: 9px solid ${TINTA}; border-radius: 34px;
    box-shadow: 12px 12px 0 ${TINTA}; transform: rotate(-3deg); line-height: 1.02;
  }
  p {
    position: absolute; top: 476px; inset-inline: 70px; text-align: center;
    font: 600 52px/1.36 Figtree; color: #545372;
  }
  .kartu {
    position: absolute; left: 110px; right: 119px; top: 1205px; height: 1800px;
    border: 9px solid ${TINTA}; border-radius: 96px; box-shadow: 22px 0 0 ${TINTA};
  }
  .ponsel { position: absolute; left: 150px; top: 778px; width: 1020px; filter: drop-shadow(26px 26px 0 ${TINTA}); }
  .hiasan { position: absolute; filter: drop-shadow(10px 10px 0 ${TINTA}); }
</style></head><body>
  <h1>${judulHtml(panel.judul, panel.warna)}</h1>
  <p>${panel.subjudul}</p>
  <div class="kartu" style="background:${WARNA[panel.warna]}"></div>
  <img class="ponsel" src="${ponsel}" />
  ${panel.hiasan
    .map(
      (h) =>
        `<div class="hiasan" style="left:${h.x}px; top:${h.y}px; transform: rotate(${h.miring}deg)">${h.jenis === 'pin' ? pin(h.warna) : bintang()}</div>`,
    )
    .join('')}
</body></html>`
}

const folder = process.argv[2]
if (!folder) {
  console.error('Pakai: npm run promo -- <folder berisi bingkai-*.png>')
  process.exit(1)
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: LEBAR, height: TINGGI } })
for (const panel of PANEL) {
  await page.setContent(await halaman(panel, folder))
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `docs/gambar/${panel.nama}.png` })
  console.log(`docs/gambar/${panel.nama}.png`)
}
await browser.close()
