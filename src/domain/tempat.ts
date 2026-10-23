import { JARI_JARI_BUMI_METER, jarakMeter, type Titik } from './lokasi'

type KategoriTempat = 'kafe' | 'resto' | 'mall' | 'stasiun'

export type Tempat = {
  /** Contoh: `node/1868699355` atau `way/251109083`. */
  osmId: string
  nama: string
  kategori: KategoriTempat
  lokasi: Titik
  /** Nama jalan dari `addr:street`, diringkas untuk subjudul kartu. `null` kalau OSM tidak punya datanya. */
  alamat: string | null
  jarakDariTengahMeter: number
}

/** Tag OSM untuk kafe, resto, dan mal. Stasiun dan halte punya aturan sendiri di `JENIS_STASIUN`. */
const TAG_KATEGORI: readonly { kunci: string; nilai: string; kategori: KategoriTempat }[] = [
  { kunci: 'amenity', nilai: 'cafe', kategori: 'kafe' },
  { kunci: 'amenity', nilai: 'restaurant', kategori: 'resto' },
  { kunci: 'amenity', nilai: 'fast_food', kategori: 'resto' },
  { kunci: 'shop', nilai: 'mall', kategori: 'mall' },
]

const nilaiTeks = (nilai: unknown) => (typeof nilai === 'string' ? nilai : '')

/**
 * Stasiun KRL dan halte TransJakarta, dua jaringan yang waktu tempuhnya dihitung Transitous. Stasiun MRT dan LRT tidak ikut
 * karena belum dihitung (#58), begitu juga pool dan terminal bus yang tidak punya `network`. Dicek di data OSM Jabodetabek
 * pada 2026-10-21: stasiun KRL ditandai `network` "KAI Commuter" atau "KAI", dan halte TransJakarta `amenity=bus_station`
 * dengan `network` "Transjakarta". `filter` untuk kueri Overpass dan `cocok` untuk membaca jawabannya harus sejalan.
 */
const JENIS_STASIUN = [
  {
    awalan: 'Stasiun',
    filter: '["railway"~"^(station|halt)$"]["network"~"^KAI",i]',
    cocok: (tag: Record<string, unknown>) => /^(station|halt)$/.test(nilaiTeks(tag.railway)) && /^kai/i.test(nilaiTeks(tag.network)),
  },
  {
    awalan: 'Halte',
    filter: '["amenity"="bus_station"]["network"~"^Transjakarta",i]',
    cocok: (tag: Record<string, unknown>) => tag.amenity === 'bus_station' && /^transjakarta/i.test(nilaiTeks(tag.network)),
  },
] as const

/** Arah peron di nama halte TransJakarta, misalnya "Pancoran Arah Barat" atau "Flyover Jatinegara Arah Barat dan Timur". */
const ARAH_PERON = /\s+arah\s+(barat|timur|utara|selatan)(\s+dan\s+(barat|timur|utara|selatan))?$/i

/**
 * Nama stasiun dan halte di OSM biasanya polos ("Tebet"), dan halte TransJakarta dipecah per arah. Arahnya dibuang supaya
 * satu halte cukup satu kandidat, lalu diberi awalan karena kategorinya sama-sama `stasiun`. Dengan begitu, Stasiun Cawang
 * dan Halte Cawang tidak tertukar di kartu. Ringkasan rute memakai aturan yang sama (src/domain/ringkasanRute.ts).
 */
export function namaStasiun(awalan: 'Stasiun' | 'Halte', nama: string): string {
  const tanpaArah = nama.replace(ARAH_PERON, '')
  return tanpaArah.toLocaleLowerCase('id').startsWith(`${awalan.toLocaleLowerCase('id')} `) ? tanpaArah : `${awalan} ${tanpaArah}`
}

/**
 * Stasiun dan halte yang ikut dihitung waktu tempuhnya. Dari lima kandidat akhir paling banyak dua yang stasiun
 * (`MAKS_STASIUN` di keadilan.ts), jadi empat sudah memberi pilihan tanpa mengambil banyak jatah kafe dan resto.
 */
const STASIUN_DIHITUNG = 4

/**
 * Nama untuk membandingkan kembar: huruf kecil dengan spasi dirapikan.
 * Angka di ujung sengaja tidak dibuang, karena "Cafe 24" dan "Cafe 99" adalah tempat yang berbeda.
 */
const namaBanding = (nama: string) => nama.toLocaleLowerCase('id').replace(/\s+/g, ' ').trim()

/**
 * Radius pencarian ikut sebaran teman: 30% dari jarak garis lurus ke orang terjauh, minimal 1 km dan maksimal 3 km.
 * Dengan begitu, tempat yang ditemukan menambah jarak orang terjauh paling banyak sekitar 30%.
 */
export const radiusPencarianMeter = (radiusTemanMeter: number) =>
  Math.min(3000, Math.max(1000, Math.round(radiusTemanMeter * 0.3)))

/**
 * Kueri Overpass QL untuk semua kategori bernama di dalam kotak selebar dua kali radius, berpusat di titik tengah.
 * Stasiun dan halte hanya ikut kalau `stasiun` diisi, yaitu saat ada yang naik transportasi umum (Discussions #63).
 * Kotak (bbox) dipakai, bukan `around`. Saat diuji 2026-10-03 di pusat Jakarta dengan radius 2,3 km, `around` selalu
 * kehabisan waktu di server publik (18–30 detik), sedangkan kotak selesai dalam 3 detik. Tempat terdekat tetap dipilih
 * lebih dulu, jadi tempat di pojok kotak jarang terpilih.
 */
export function kueriOverpass({ lat, lng }: Titik, radiusMeter: number, { stasiun = false } = {}): string {
  const dLat = radiusMeter / ((JARI_JARI_BUMI_METER * Math.PI) / 180)
  const dLng = dLat / Math.cos((lat * Math.PI) / 180)
  const kotak = [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map((n) => n.toFixed(5)).join(',')
  const tag = [...TAG_KATEGORI.map(({ kunci, nilai }) => `["${kunci}"="${nilai}"]`), ...(stasiun ? JENIS_STASIUN.map((j) => j.filter) : [])]
  const filter = tag.map((t) => `nwr${t}["name"](${kotak});`).join('')
  return `[out:json][timeout:10];(${filter});out center tags;`
}

/**
 * `addr:street` di OSM Indonesia formatnya macam-macam, dari "Jalan Tebet Raya" sampai alamat lengkap dengan RT/RW.
 * Yang diambil hanya nama jalannya, dengan awalan "Jl.".
 */
export function ringkasAlamat(jalan: string): string | null {
  const ringkas = jalan
    .split(',')[0]
    .replace(/\s+no\.?\s*\d.*$/i, '')
    .replace(/^(jalan\s+|jln\.?\s*|jl\.?\s*)/i, 'Jl. ')
    .replace(/\s+/g, ' ')
    .trim()
  return ringkas.length >= 3 && ringkas.length <= 40 ? ringkas : null
}

/** Mengubah jawaban Overpass (`unknown`, karena datang dari luar) jadi daftar tempat. Elemen yang tidak lengkap dilewati. */
export function bacaTempat(jawaban: unknown, tengah: Titik): Tempat[] {
  const elemen = objek(jawaban)?.elements
  return Array.isArray(elemen) ? elemen.flatMap((e) => bacaElemen(e, tengah) ?? []) : []
}

/**
 * Tempat terdekat lebih dulu, dan tiap kategori dibatasi supaya tidak semuanya kafe. Stasiun paling banyak empat.
 * Satu nama cukup satu kandidat, yaitu cabang yang terdekat. Dari lima pilihan akhir, dua Starbucks tidak menambah pilihan.
 */
export function pilihKandidat(tempat: readonly Tempat[], batas = { total: 20, perKategori: 8 }): Tempat[] {
  const terpilih: Tempat[] = []
  const jumlahKategori = new Map<KategoriTempat, number>()
  const urut = tempat.toSorted((a, b) => a.jarakDariTengahMeter - b.jarakDariTengahMeter || a.osmId.localeCompare(b.osmId))
  for (const t of urut) {
    if (terpilih.length >= batas.total) break
    const jumlah = jumlahKategori.get(t.kategori) ?? 0
    if (jumlah >= (t.kategori === 'stasiun' ? STASIUN_DIHITUNG : batas.perKategori)) continue
    const nama = namaBanding(t.nama)
    if (terpilih.some((p) => namaBanding(p.nama) === nama)) continue
    terpilih.push(t)
    jumlahKategori.set(t.kategori, jumlah + 1)
  }
  return terpilih
}

const objek = (nilai: unknown) => (typeof nilai === 'object' && nilai !== null ? (nilai as Record<string, unknown>) : null)

function titikDari(lat: unknown, lon: unknown): Titik | null {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat, lng: lon }
    : null
}

function bacaElemen(mentah: unknown, tengah: Titik): Tempat | null {
  const e = objek(mentah)
  const tag = objek(e?.tags)
  if (!e || !tag || typeof e.type !== 'string' || typeof e.id !== 'number') return null

  const nama = typeof tag.name === 'string' ? tag.name.trim() : ''
  const kategoriTag = TAG_KATEGORI.find(({ kunci, nilai }) => tag[kunci] === nilai)?.kategori
  const stasiun = kategoriTag ? undefined : JENIS_STASIUN.find((j) => j.cocok(tag))
  const kategori = kategoriTag ?? (stasiun ? 'stasiun' : undefined)
  // Node punya lat/lon sendiri, sedangkan way dan relation memakai `center` dari `out center`.
  const pusat = objek(e.center)
  const lokasi = titikDari(e.lat, e.lon) ?? titikDari(pusat?.lat, pusat?.lon)
  if (!nama || !kategori || !lokasi) return null

  return {
    osmId: `${e.type}/${e.id}`,
    nama: stasiun ? namaStasiun(stasiun.awalan, nama) : nama,
    kategori,
    lokasi,
    alamat: typeof tag['addr:street'] === 'string' ? ringkasAlamat(tag['addr:street']) : null,
    jarakDariTengahMeter: Math.round(jarakMeter(tengah, lokasi)),
  }
}
