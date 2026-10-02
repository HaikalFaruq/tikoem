export type Titik = { lat: number; lng: number }

/** Tiga angka di belakang koma kira-kira 110 meter: cukup untuk menghitung waktu tempuh, tapi rumah orang tidak terlihat persis. */
const PRESISI_LOKASI = 3

export const titikValid = ({ lat, lng }: Titik) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

export function samarkan({ lat, lng }: Titik): Titik {
  const faktor = 10 ** PRESISI_LOKASI
  return { lat: Math.round(lat * faktor) / faktor, lng: Math.round(lng * faktor) / faktor }
}
