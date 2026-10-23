// Server tiruan untuk Overpass, OpenRouteService, Nominatim, dan Transitous selama E2E. Jawabannya selalu sama, tanpa
// membebani server asli dan tanpa key ORS. Dijalankan langsung oleh Node (`node e2e/layanan-tiruan.ts <port>`), jadi hanya
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
 *
 * Kalau kuerinya ikut mencari stasiun, yaitu saat ada yang naik transportasi umum, ada juga dua stasiun KRL dan satu
 * halte TransJakarta yang dipecah per arah. Semuanya sekitar 11 m dari pusat kotak.
 *
 * Di Bogor (`LOKASI_TEMPAT_TUTUP_MALAM`), keenam tempatnya hanya buka pukul 08.00–17.00, untuk menguji saringan jam buka.
 */
function overpass(kueri: string): { status: number; isi: unknown } {
  const kotak = /\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/.exec(kueri)
  if (!kotak) return { status: 400, isi: { remark: 'error: kueri tidak dikenal layanan tiruan' } }
  const [selatan, barat, utara, timur] = kotak.slice(1).map(Number)
  const lat = (selatan + utara) / 2
  const lng = (barat + timur) / 2
  if (lat < -60) return { status: 200, isi: { elements: [] } }
  if (lat > 60) return { status: 503, isi: { error: 'layanan tiruan sengaja gagal' } }
  const tutupMalam = lat > -6.65 && lat < -6.55 && lng > 106.75 && lng < 106.85
  const tempat = Array.from({ length: 6 }, (_, i) => ({
    type: 'node',
    id: i + 1,
    lat: lat + (i - 2.5) * 0.001,
    lon: lng + (i % 2) * 0.001,
    tags: {
      amenity: i % 2 ? 'cafe' : 'restaurant',
      name: `Tempat Tiruan ${i + 1}`,
      ...(i === 0 ? { 'addr:street': 'Jalan Tiruan Raya' } : {}),
      ...(tutupMalam ? { opening_hours: 'Mo-Su 08:00-17:00' } : {}),
    },
  }))
  const stasiun = kueri.includes('"railway"')
    ? [
        { type: 'node', id: 101, lat: lat + 0.0001, lon: lng, tags: { railway: 'station', network: 'KAI Commuter', name: 'Tiruan' } },
        { type: 'node', id: 102, lat: lat - 0.0001, lon: lng, tags: { railway: 'station', network: 'KAI Commuter', name: 'Tiruan Baru' } },
        { type: 'node', id: 103, lat, lon: lng + 0.0001, tags: { amenity: 'bus_station', network: 'Transjakarta', name: 'Tiruan Arah Barat' } },
        { type: 'node', id: 104, lat, lon: lng - 0.0001, tags: { amenity: 'bus_station', network: 'Transjakarta', name: 'Tiruan Arah Timur' } },
      ]
    : []
  return { status: 200, isi: { elements: [...tempat, ...stasiun] } }
}

/** Teluk Jakarta, tempat `LOKASI_TIDAK_TERJANGKAU` di e2e/backend.ts. Tidak ada jalan di sana. */
const diLaut = ([lng, lat]: number[]) => lat > -6.09 && lat < -6 && lng > 106.7 && lng < 107

/**
 * Durasi dari jarak garis lurus dibagi kecepatan profilnya. Seperti ORS 9 asli, asal yang jauh dari jalan jadi `null`
 * di `sources`, dan seluruh barisnya `null`.
 */
function matriks(profil: string, isi: { locations: number[][]; sources: number[]; destinations: number[] }) {
  const kecepatan = KECEPATAN[profil] ?? 8
  return {
    durations: isi.sources.map((i) =>
      isi.destinations.map((j) => (diLaut(isi.locations[i]) ? null : Math.round(jarakMeter(isi.locations[i], isi.locations[j]) / kecepatan))),
    ),
    sources: isi.sources.map((i) => (diLaut(isi.locations[i]) ? null : { location: isi.locations[i] })),
  }
}

/** Cileungsi, `LOKASI_TANPA_TRANSPORTASI_UMUM` di e2e/backend.ts. Tidak ada halte atau stasiun di dekatnya. */
const jauhDariHalte = ([lng, lat]: number[]) => lat > -6.45 && lat < -6.35 && lng > 106.95 && lng < 107.05

/** "lintang;bujur" dari MOTIS jadi [bujur, lintang], urutan yang dipakai `jarakMeter`. */
function titikMotis(teks: string) {
  const [lat, lng] = teks.split(';').map(Number)
  return [lng, lat]
}

/**
 * Transitous `one-to-many-intermodal`. Jalan kaki langsung hanya sampai 30 menit, seperti `maxDirectTime` bawaan MOTIS.
 * Transportasi umum makan 10 menit ke dan dari halte, lalu 6 meter per detik dari jarak garis lurus. Seperti MOTIS asli,
 * jawabannya `{}` kalau tidak ada rute ke tujuan mana pun.
 */
function transitous(kueri: URLSearchParams) {
  const asal = titikMotis(kueri.get('one') ?? '')
  if (jauhDariHalte(asal)) return {}
  const jarak = (kueri.get('many') ?? '').split(',').map((t) => jarakMeter(asal, titikMotis(t)))
  return {
    street_durations: jarak.map((m) => (m / 1.3 <= 1800 ? { duration: Math.round(m / 1.3) } : {})),
    transit_durations: jarak.map((m) => [{ duration: 600 + Math.round(m / 6), transfers: 1 }]),
  }
}

/** Di Lebak Bulus (`LOKASI_RUTE_GAGAL_SEKALI` di e2e/backend.ts), permintaan ringkasan rute pertama dari tiap titik menjawab 503. */
const ruteGagalSekali = ([lng, lat]: number[]) => lat > -6.3 && lat < -6.28 && lng > 106.76 && lng < 106.79
const sudahGagal = new Set<string>()

/**
 * Transitous `/api/v6/plan` untuk ringkasan rute. Satu pilihan: jalan 5 menit ke stasiun Tiruan, KRL 12 menit lewat dua
 * stasiun, lalu jalan 4 menit. Nama stasiunnya huruf besar seperti feed KRL asli. Dengan `arriveBy=true`, perjalanannya
 * sampai tepat di jam yang diminta. Dari Cileungsi (`LOKASI_TANPA_TRANSPORTASI_UMUM`) tidak ada pilihan sama sekali.
 */
function rencana(kueri: URLSearchParams): { status: number; isi: unknown } {
  const dari = kueri.get('fromPlace') ?? ''
  const [lat, lng] = dari.split(',').map(Number)
  if (ruteGagalSekali([lng, lat]) && !sudahGagal.has(dari)) {
    sudahGagal.add(dari)
    return { status: 503, isi: { error: 'layanan tiruan sengaja gagal' } }
  }
  if (jauhDariHalte([lng, lat])) return { status: 200, isi: { direct: [], itineraries: [] } }
  const waktu = Date.parse(kueri.get('time') ?? '')
  const awal = kueri.get('arriveBy') === 'true' ? waktu - 21 * 60_000 : waktu
  const jam = (menit: number) => new Date(awal + menit * 60_000).toISOString()
  const krl = {
    mode: 'REGIONAL_RAIL',
    startTime: jam(5),
    endTime: jam(17),
    from: { name: 'TIRUAN' },
    to: { name: 'TIRUAN BARU' },
    headsign: 'TIRUANBARU',
    tripTo: { name: 'TIRUAN BARU' },
    routeShortName: 'T',
    routeLongName: 'Commuter Line Tiruan',
    agencyName: 'Kereta Commuter Indonesia',
    routeColor: 'e30a16',
    routeTextColor: 'ffffff',
    intermediateStops: [{ name: 'TIRUAN TENGAH' }, { name: 'TIRUAN SELATAN' }],
  }
  const legs = [
    { mode: 'WALK', startTime: jam(0), endTime: jam(5), from: { name: 'START' }, to: { name: 'TIRUAN' } },
    krl,
    { mode: 'WALK', startTime: jam(17), endTime: jam(21), from: { name: 'TIRUAN BARU' }, to: { name: 'END' } },
  ]
  return { status: 200, isi: { direct: [], itineraries: [{ duration: 21 * 60, startTime: jam(0), endTime: jam(21), transfers: 0, legs }] } }
}

/** Dua pilihan alamat. Teks yang mengandung "gagal" membuat layanan menjawab 503, untuk menguji LAYANAN_GAGAL. */
function nominatim(q: string) {
  if (/gagal/i.test(q)) return null
  return [
    { lat: '-6.2232551', lon: '106.8426972', name: 'Kota Kasablanka', address: { village: 'Menteng Dalam', suburb: 'Tebet', city_district: 'Jakarta Selatan' } },
    { lat: '-6.2266', lon: '106.8588', name: 'Taman Tebet', address: { village: 'Tebet Timur', suburb: 'Tebet', city_district: 'Jakarta Selatan' } },
  ]
}

/**
 * Alamat dari titik (reverse). Di utara lintang 60 (`LOKASI_LAYANAN_GAGAL`) layanan menjawab 503, dan di Teluk Jakarta
 * (`LOKASI_TIDAK_TERJANGKAU`) tidak ada alamat, seperti Nominatim asli untuk titik di laut.
 */
function nominatimBalik(lat: number, lng: number): { status: number; isi: unknown } {
  if (lat > 60) return { status: 503, isi: { error: 'layanan tiruan sengaja gagal' } }
  if (diLaut([lng, lat])) return { status: 200, isi: { error: 'Unable to geocode' } }
  const address = { road: 'Jalan Tiruan Raya', village: 'Tebet Timur', suburb: 'Tebet', city_district: 'Jakarta Selatan' }
  return { status: 200, isi: { name: 'Tempat Tiruan', category: 'amenity', address } }
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

    if (permintaan.method === 'GET' && url.pathname === '/transitous/api/experimental/one-to-many-intermodal') {
      return kirim(jawaban, 200, transitous(url.searchParams))
    }

    if (permintaan.method === 'GET' && url.pathname === '/transitous/api/v6/plan') {
      const { status, isi } = rencana(url.searchParams)
      return kirim(jawaban, status, isi)
    }

    if (permintaan.method === 'GET' && url.pathname === '/nominatim/reverse') {
      const { status, isi } = nominatimBalik(Number(url.searchParams.get('lat')), Number(url.searchParams.get('lon')))
      return kirim(jawaban, status, isi)
    }

    kirim(jawaban, 404, { error: 'tidak ada di layanan tiruan' })
  } catch {
    kirim(jawaban, 500, { error: 'layanan tiruan gagal membaca permintaan' })
  }
}).listen(port, '127.0.0.1')
