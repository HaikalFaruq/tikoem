import { namaStasiun } from './tempat'

const MENIT = 60_000
/** Pilihan dengan pindah kendaraan lebih sedikit menang kalau selisihnya paling banyak segini (Discussions #83). */
const SELISIH_PINDAH_MS = 5 * MENIT

/** Satu bagian perjalanan dari Transitous, sudah dibaca dari bentuk MOTIS (convex/transitous.ts). Waktu dalam milidetik. */
export type BagianPerjalanan = {
  /** Moda MOTIS: `WALK`, `BUS`, `REGIONAL_RAIL`, dan seterusnya. */
  moda: string
  mulai: number
  selesai: number
  dari: string
  ke: string
  jalurPendek: string | null
  jalurPanjang: string | null
  /** Tulisan arah di kendaraannya (headsign). */
  arah: string | null
  /** Halte atau stasiun terakhir kendaraan itu, bukan tempat turun. */
  ujung: string | null
  operator: string | null
  /** Halte atau stasiun yang dilewati sebelum turun. */
  perhentian: number
  /** Warna jalur dari feed (GTFS `route_color`), tanpa "#". */
  warna: string | null
  warnaTeks: string | null
}

export type PilihanPerjalanan = { berangkat: number; sampai: number; pindah: number; bagian: BagianPerjalanan[] }

type Warna = { latar: string; teks: string }
type Langkah =
  | { jenis: 'jalan'; mulai: number; menit: number; ke: string | null }
  | {
      jenis: 'kereta' | 'bus'
      layanan: string
      jalur: string
      arah: string
      naik: string
      turun: string
      mulai: number
      menit: number
      perhentian: number
      warna: Warna | null
    }
type RingkasanSelesai =
  | { status: 'tidak_ada'; jamKetemuan: number | null }
  | { status: 'siap'; jamKetemuan: number | null; dihitungPada: number; berangkat: number; sampai: number; langkah: Langkah[] }

/** Moda MOTIS untuk kereta. Selain ini dan jalan kaki, kendaraannya dianggap bus. */
const MODA_KERETA = new Set(['RAIL', 'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'SUBURBAN', 'SUBWAY', 'METRO', 'TRAM', 'HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL'])
const jenisKendaraan = (moda: string): 'kereta' | 'bus' => (MODA_KERETA.has(moda) ? 'kereta' : 'bus')

/** Nama operator di feed Transitous, dan sebutan yang dikenal penumpang. */
const LAYANAN: Record<string, string> = { 'Kereta Commuter Indonesia': 'KRL', Transjakarta: 'TransJakarta' }

/** Nomor peron di ujung nama halte TransJakarta di feed, misalnya "MH Thamrin 3". */
const NOMOR_PERON = /\s+\d+$/
const TERMINAL = /^term\.?\s+/i
const WARNA_HEKS = /^[0-9a-f]{6}$/i

/** Nama di feed KRL ditulis huruf besar semua ("DEPOK BARU", "UNIV. INDONESIA"), jadi dirapikan per kata. */
function rapikanHurufBesar(nama: string): string {
  if (/\p{Ll}/u.test(nama)) return nama
  return nama.toLocaleLowerCase('id').replace(/(^|[\s.(/-])(\p{L})/gu, (_, sebelum: string, huruf: string) => sebelum + huruf.toLocaleUpperCase('id'))
}

/** Nama stasiun dan halte dengan aturan yang sama seperti kandidat (#70), ditambah nomor peron yang dibuang. */
function namaPerhentian(nama: string, jenis: 'kereta' | 'bus'): string {
  if (jenis === 'kereta') return namaStasiun('Stasiun', rapikanHurufBesar(nama))
  const tanpaPeron = nama.replace(NOMOR_PERON, '')
  if (TERMINAL.test(tanpaPeron)) return tanpaPeron.replace(TERMINAL, 'Terminal ')
  return namaStasiun('Halte', tanpaPeron)
}

/** Kalau warna tulisannya kosong, GTFS memakai hitam. */
function warnaJalur(latar: string | null, teks: string | null): Warna | null {
  if (latar === null || !WARNA_HEKS.test(latar)) return null
  return { latar: `#${latar.toLowerCase()}`, teks: teks !== null && WARNA_HEKS.test(teks) ? `#${teks.toLowerCase()}` : '#000000' }
}

function pilihTerbaik(pilihan: readonly PilihanPerjalanan[], tiba: boolean): PilihanPerjalanan | undefined {
  // Makin besar makin baik: berangkat paling akhir kalau ada jam ketemuan, sampai paling awal kalau tidak.
  const nilai = (p: PilihanPerjalanan) => (tiba ? p.berangkat : -p.sampai)
  const terbaik = Math.max(...pilihan.map(nilai))
  return pilihan.filter((p) => terbaik - nilai(p) <= SELISIH_PINDAH_MS).toSorted((a, b) => a.pindah - b.pindah || nilai(b) - nilai(a))[0]
}

function langkahDari(bagian: readonly BagianPerjalanan[], geserMs: number): Langkah[] {
  return bagian.flatMap((b, i): Langkah[] => {
    const mulai = b.mulai - geserMs
    const menit = Math.ceil((b.selesai - b.mulai) / MENIT)
    if (b.moda === 'WALK') {
      // Jalan kaki nol detik, misalnya pindah di peron yang sama, tidak perlu disebut.
      if (menit === 0) return []
      const berikut = bagian[i + 1]
      const ke = !berikut ? null : berikut.moda === 'WALK' ? rapikanHurufBesar(b.ke) : namaPerhentian(b.ke, jenisKendaraan(berikut.moda))
      return [{ jenis: 'jalan', mulai, menit, ke }]
    }
    const jenis = jenisKendaraan(b.moda)
    const layanan = b.operator === null ? (jenis === 'kereta' ? 'Kereta' : 'Bus') : (LAYANAN[b.operator] ?? b.operator)
    return [
      {
        jenis,
        layanan,
        // Penumpang KRL mengenal nama jalurnya ("Commuter Line Bogor"), penumpang TransJakarta nomor koridornya ("1H").
        jalur: (jenis === 'kereta' ? (b.jalurPanjang ?? b.jalurPendek) : (b.jalurPendek ?? b.jalurPanjang)) ?? layanan,
        // Arah KRL di feed ditulis rapat ("JAKARTAKOTA"), jadi diambil dari stasiun terakhirnya. Bus TransJakarta yang melingkar
        // berakhir di halte awalnya, jadi untuk bus yang dipakai tulisan arahnya.
        arah: jenis === 'kereta' ? rapikanHurufBesar(b.ujung ?? b.arah ?? b.ke) : (b.arah ?? b.ujung ?? b.ke),
        naik: namaPerhentian(b.dari, jenis),
        turun: namaPerhentian(b.ke, jenis),
        mulai,
        menit,
        perhentian: b.perhentian,
        warna: warnaJalur(b.warna, b.warnaTeks),
      },
    ]
  })
}

type OpsiRingkasan = {
  /** Jam ketemuan yang dipakai. Kalau ada, Transitous ditanya rute yang sampai paling lambat jam itu. */
  jamKetemuan: number | null
  dihitungPada: number
  /** Selisih jam yang ditanyakan ke Transitous dengan jam aslinya di akhir pekan (`berangkatTransportasiUmum`). */
  geserMs: number
}

/**
 * Ringkasan rute untuk kartu Fix! dari pilihan perjalanan Transitous (Discussions #83). Dengan jam ketemuan, yang diambil
 * pilihan yang berangkat paling akhir. Tanpa jam ketemuan, yang paling cepat sampai. Pilihan dengan pindah kendaraan lebih
 * sedikit menang kalau selisihnya paling banyak 5 menit. Semua jam dikembalikan ke hari aslinya dengan `geserMs`.
 */
export function ringkasRute(pilihan: readonly PilihanPerjalanan[], { jamKetemuan, dihitungPada, geserMs }: OpsiRingkasan): RingkasanSelesai {
  const terpilih = pilihTerbaik(pilihan, jamKetemuan !== null)
  if (!terpilih) return { status: 'tidak_ada', jamKetemuan }
  return {
    status: 'siap',
    jamKetemuan,
    dihitungPada,
    berangkat: terpilih.berangkat - geserMs,
    sampai: terpilih.sampai - geserMs,
    langkah: langkahDari(terpilih.bagian, geserMs),
  }
}
