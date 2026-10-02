import { JARI_JARI_BUMI_METER, jarakMeter, type Titik } from './lokasi'

export type TitikTengah = {
  titik: Titik
  /** Jarak garis lurus dari titik tengah ke orang yang paling jauh. */
  radiusMeter: number
}

type Datar = { x: number; y: number }
type Lingkaran = { pusat: Datar; r: number }

/** Selisih galat pembulatan yang masih dianggap "di dalam lingkaran", dalam meter. */
const TOLERANSI_METER = 1e-3

/**
 * Titik awal pencarian tempat: pusat lingkaran terkecil yang memuat lokasi semua orang.
 * Di titik ini jarak garis lurus ke orang yang paling jauh sekecil mungkin, jadi tidak ada yang jauh sendiri.
 * Rata-rata koordinat biasa tidak dipakai karena condong ke kelompok yang tinggal berdekatan.
 *
 * Dihitung di bidang datar di sekitar lokasi (proyeksi ekuirektangular). Untuk skala kota, titiknya meleset
 * paling banyak beberapa meter dari hitungan di permukaan bola, jauh di bawah lokasi yang memang disamarkan 110 m.
 * Semua pasangan dan trio titik dicoba. Dengan maksimal 24 orang per room, itu sekitar 2.300 lingkaran.
 */
export function titikTengah(lokasi: readonly Titik[]): TitikTengah | null {
  if (lokasi.length === 0) return null
  const proyeksi = buatProyeksi(lokasi)
  const titik = proyeksi.keBumi(lingkaranTerkecil(lokasi.map(proyeksi.keDatar)).pusat)
  // Radius diukur ulang di permukaan bumi supaya sama persis dengan jarak ke orang yang paling jauh.
  return { titik, radiusMeter: Math.max(...lokasi.map((t) => jarakMeter(titik, t))) }
}

function lingkaranTerkecil(titik: readonly Datar[]): Lingkaran {
  // Lingkaran terkecil selalu ditentukan oleh dua titik (sebagai diameter) atau tiga titik di tepinya.
  let terbaik: Lingkaran | null = null
  for (let i = 0; i < titik.length; i++) {
    for (let j = i + 1; j < titik.length; j++) {
      terbaik = lebihKecil(dariDua(titik[i], titik[j]), terbaik, titik)
      for (let k = j + 1; k < titik.length; k++) terbaik = lebihKecil(dariTiga(titik[i], titik[j], titik[k]), terbaik, titik)
    }
  }
  return terbaik ?? { pusat: titik[0], r: 0 }
}

function lebihKecil(calon: Lingkaran | null, terbaik: Lingkaran | null, semua: readonly Datar[]): Lingkaran | null {
  if (!calon || (terbaik && calon.r >= terbaik.r)) return terbaik
  return semua.every((p) => Math.hypot(p.x - calon.pusat.x, p.y - calon.pusat.y) <= calon.r + TOLERANSI_METER) ? calon : terbaik
}

function dariDua(a: Datar, b: Datar): Lingkaran {
  return { pusat: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r: Math.hypot(a.x - b.x, a.y - b.y) / 2 }
}

/** Lingkaran yang melewati tiga titik. `null` kalau ketiganya segaris. */
function dariTiga(a: Datar, b: Datar, c: Datar): Lingkaran | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const [a2, b2, c2] = [a.x ** 2 + a.y ** 2, b.x ** 2 + b.y ** 2, c.x ** 2 + c.y ** 2]
  const pusat = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  }
  return { pusat, r: Math.hypot(a.x - pusat.x, a.y - pusat.y) }
}

/** Selisih bujur di rentang -180 sampai 180, supaya titik di dua sisi garis bujur 180 tetap berdekatan. */
const normalisasiBujur = (bujur: number) =>
  bujur >= -180 && bujur < 180 ? bujur : ((((bujur + 180) % 360) + 360) % 360) - 180

function buatProyeksi(lokasi: readonly Titik[]) {
  const asal = lokasi[0]
  const latRata = lokasi.reduce((jumlah, t) => jumlah + t.lat, 0) / lokasi.length
  const meterPerDerajatLat = (JARI_JARI_BUMI_METER * Math.PI) / 180
  const meterPerDerajatLng = meterPerDerajatLat * Math.cos((latRata * Math.PI) / 180)
  return {
    keDatar: (t: Titik): Datar => ({
      x: normalisasiBujur(t.lng - asal.lng) * meterPerDerajatLng,
      y: (t.lat - asal.lat) * meterPerDerajatLat,
    }),
    keBumi: (p: Datar): Titik => ({
      lat: asal.lat + p.y / meterPerDerajatLat,
      lng: normalisasiBujur(asal.lng + p.x / meterPerDerajatLng),
    }),
  }
}
