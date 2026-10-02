import { JARI_JARI_BUMI_METER, type Titik } from './lokasi'

/** Pasangan [bujur, lintang], urutan yang dipakai GeoJSON dan MapLibre. */
export type Koordinat = [number, number]

/**
 * Cincin poligon berbentuk lingkaran di permukaan bumi, untuk area samar di sekitar lokasi yang disamarkan.
 * Titik pertama diulang di akhir, sesuai aturan cincin GeoJSON.
 */
export function lingkaranGeo(pusat: Titik, radiusMeter: number, jumlahTitik = 48): Koordinat[] {
  const derajatLat = (radiusMeter / JARI_JARI_BUMI_METER) * (180 / Math.PI)
  const derajatLng = derajatLat / Math.cos((pusat.lat * Math.PI) / 180)
  const cincin: Koordinat[] = []
  for (let i = 0; i < jumlahTitik; i++) {
    const sudut = (2 * Math.PI * i) / jumlahTitik
    cincin.push([pusat.lng + derajatLng * Math.cos(sudut), pusat.lat + derajatLat * Math.sin(sudut)])
  }
  cincin.push(cincin[0])
  return cincin
}

export type TitikLayar = { x: number; y: number }

/**
 * Geseran layar (piksel) supaya pin yang berdekatan di layar tidak saling menutupi.
 * Ini sering terjadi karena lokasi dibulatkan ke grid ~110 m, dan di zoom kota jarak 110 m hanya beberapa piksel.
 * Pin yang berjarak kurang dari `ambangPx` dikelompokkan, lalu disebar melingkar di sekitar pin pertama kelompok.
 * Pin yang sendirian tidak digeser.
 */
export function sebarPinBerdekatan(titik: readonly TitikLayar[], ambangPx = 28, jarakPx = 18): TitikLayar[] {
  const kelompok: { pusat: TitikLayar; anggota: number[] }[] = []
  titik.forEach((t, i) => {
    const dekat = kelompok.find((k) => Math.hypot(t.x - k.pusat.x, t.y - k.pusat.y) < ambangPx)
    if (dekat) dekat.anggota.push(i)
    else kelompok.push({ pusat: t, anggota: [i] })
  })
  const geser = titik.map(() => ({ x: 0, y: 0 }))
  for (const { pusat, anggota } of kelompok) {
    if (anggota.length < 2) continue
    anggota.forEach((indeks, urutan) => {
      // Mulai dari kiri, berputar searah jarum jam.
      const sudut = Math.PI + (2 * Math.PI * urutan) / anggota.length
      geser[indeks] = {
        x: Math.round(pusat.x + jarakPx * Math.cos(sudut) - titik[indeks].x),
        y: Math.round(pusat.y + jarakPx * Math.sin(sudut) - titik[indeks].y),
      }
    })
  }
  return geser
}

/** Kotak terkecil yang memuat semua titik: [[barat, selatan], [timur, utara]]. */
export function batasPeta(titik: readonly Titik[]): [Koordinat, Koordinat] | null {
  if (titik.length === 0) return null
  const lat = titik.map((t) => t.lat)
  const lng = titik.map((t) => t.lng)
  return [
    [Math.min(...lng), Math.min(...lat)],
    [Math.max(...lng), Math.max(...lat)],
  ]
}
