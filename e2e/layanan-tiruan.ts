// Server tiruan untuk Overpass, OpenRouteService, dan Nominatim selama E2E. Jawabannya selalu sama, tanpa membebani
// server asli dan tanpa key ORS. Dijalankan langsung oleh Node (`node e2e/layanan-tiruan.ts <port>`), jadi hanya
// memakai modul bawaan Node dan sintaks TypeScript yang bisa dibuang begitu saja.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const port = Number(process.argv[2] ?? 4319)

/** Kecepatan rata-rata (meter per detik) untuk tiap profil ORS: mobil di kota dan orang berjalan kaki. */
const KECEPATAN: Record<string, number> = { 'driving-car': 8, 'foot-walking': 1.3 }

/** Jarak garis lurus antara dua titik [bujur, lintang], seperti urutan di `locations` ORS. */
function jarakMeter([lngA, latA]: number[], [lngB, latB]: number[]) {
  const rad = Math.PI / 180
  const h = Math.sin(((latB - latA) * rad) / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(((lngB - lngA) * rad) / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function bacaIsi(permintaan: IncomingMessage) {
  const potongan: Buffer[] = []
  for await (const p of permintaan) potongan.push(p as Buffer)
  return Buffer.concat(potongan).toString('utf8')
}

function kirim(jawaban: ServerResponse, status: number, isi: unknown) {
  jawaban.writeHead(status, { 'Content-Type': 'application/json' })
  jawaban.end(JSON.stringify(isi))
}

/**
 * Enam tempat di sekitar pusat kotak yang diminta `kueriOverpass`, kecuali di dua daerah khusus untuk E2E keadaan gagal
 * (lihat `LOKASI_TANPA_TEMPAT` dan `LOKASI_LAYANAN_GAGAL` di e2e/backend.ts):
 * - di selatan lintang -60: tidak ada tempat
 * - di utara lintang 60: layanan menjawab 503
 */
function overpass(kueri: string): { status: number; isi: unknown } {
  const kotak = /\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/.exec(kueri)
  if (!kotak) return { status: 400, isi: { remark: 'error: kueri tidak dikenal layanan tiruan' } }
  const [selatan, barat, utara, timur] = kotak.slice(1).map(Number)
  const lat = (selatan + utara) / 2
  const lng = (barat + timur) / 2
  if (lat < -60) return { status: 200, isi: { elements: [] } }
  if (lat > 60) return { status: 503, isi: { error: 'layanan tiruan sengaja gagal' } }
  const isi = {
    elements: Array.from({ length: 6 }, (_, i) => ({
      type: 'node',
      id: i + 1,
      lat: lat + (i - 2.5) * 0.001,
      lon: lng + (i % 2) * 0.001,
      tags: {
        amenity: i % 2 ? 'cafe' : 'restaurant',
        name: `Tempat Tiruan ${i + 1}`,
        ...(i === 0 ? { 'addr:street': 'Jalan Tiruan Raya' } : {}),
      },
    })),
  }
  return { status: 200, isi }
}

/** Durasi dari jarak garis lurus dibagi kecepatan profilnya. */
function matriks(profil: string, isi: { locations: number[][]; sources: number[]; destinations: number[] }) {
  const kecepatan = KECEPATAN[profil] ?? 8
  return {
    durations: isi.sources.map((i) => isi.destinations.map((j) => Math.round(jarakMeter(isi.locations[i], isi.locations[j]) / kecepatan))),
  }
}

/** Dua pilihan alamat. Teks yang mengandung "gagal" membuat layanan menjawab 503, untuk menguji LAYANAN_GAGAL. */
function nominatim(q: string) {
  if (/gagal/i.test(q)) return null
  return [
    { lat: '-6.2232551', lon: '106.8426972', name: 'Kota Kasablanka', address: { village: 'Menteng Dalam', suburb: 'Tebet', city_district: 'Jakarta Selatan' } },
    { lat: '-6.2266', lon: '106.8588', name: 'Taman Tebet', address: { village: 'Tebet Timur', suburb: 'Tebet', city_district: 'Jakarta Selatan' } },
  ]
}

createServer(async (permintaan, jawaban) => {
  const url = new URL(permintaan.url ?? '/', `http://127.0.0.1:${port}`)
  try {
    if (url.pathname === '/') return kirim(jawaban, 200, { siap: true })

    if (permintaan.method === 'POST' && url.pathname === '/overpass') {
      const { status, isi } = overpass(new URLSearchParams(await bacaIsi(permintaan)).get('data') ?? '')
      return kirim(jawaban, status, isi)
    }

    const profil = /^\/ors\/v2\/matrix\/([\w-]+)$/.exec(url.pathname)?.[1]
    if (permintaan.method === 'POST' && profil) return kirim(jawaban, 200, matriks(profil, JSON.parse(await bacaIsi(permintaan))))

    if (permintaan.method === 'GET' && url.pathname === '/nominatim/search') {
      const hasil = nominatim(url.searchParams.get('q') ?? '')
      return hasil ? kirim(jawaban, 200, hasil) : kirim(jawaban, 503, { error: 'layanan tiruan sengaja gagal' })
    }

    kirim(jawaban, 404, { error: 'tidak ada di layanan tiruan' })
  } catch {
    kirim(jawaban, 500, { error: 'layanan tiruan gagal membaca permintaan' })
  }
}).listen(port, '127.0.0.1')
