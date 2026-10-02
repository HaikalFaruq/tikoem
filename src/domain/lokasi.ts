export type Titik = { lat: number; lng: number }

/** Jari-jari rata-rata bumi (IUGG). */
export const JARI_JARI_BUMI_METER = 6_371_008.8

/** Jarak garis lurus di permukaan bumi (rumus haversine). */
export function jarakMeter(a: Titik, b: Titik): number {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 2 * JARI_JARI_BUMI_METER * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Tiga angka di belakang koma kira-kira 110 meter: cukup untuk menghitung waktu tempuh, tapi rumah orang tidak terlihat persis. */
const PRESISI_LOKASI = 3

export const titikValid = ({ lat, lng }: Titik) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

export function samarkan({ lat, lng }: Titik): Titik {
  const faktor = 10 ** PRESISI_LOKASI
  return { lat: Math.round(lat * faktor) / faktor, lng: Math.round(lng * faktor) / faktor }
}
