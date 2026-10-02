import { titikValid, type Titik } from './lokasi'

export type HasilCariAlamat = { label: string; lokasi: Titik }

const MAKS_HASIL = 5

/** Teks pencarian yang layak dikirim: 3 sampai 100 karakter setelah spasi dirapikan. `null` kalau tidak layak. */
export function rapikanTeksCari(teks: string): string | null {
  const rapi = teks.trim().replace(/\s+/g, ' ')
  return rapi.length >= 3 && rapi.length <= 100 ? rapi : null
}

/**
 * Mengubah jawaban Nominatim (`format=jsonv2&addressdetails=1`) jadi paling banyak lima pilihan.
 * Labelnya nama tempat, kelurahan, kecamatan, dan kota, misalnya "Kota Kasablanka, Menteng Dalam, Tebet, Jakarta Selatan".
 * Pilihan dengan label kembar disatukan, karena satu jalan sering terpecah jadi beberapa potongan di OSM.
 */
export function bacaHasilNominatim(jawaban: unknown): HasilCariAlamat[] {
  if (!Array.isArray(jawaban)) return []
  const hasil: HasilCariAlamat[] = []
  for (const mentah of jawaban) {
    const item = objek(mentah)
    if (!item) continue
    const lokasi = { lat: angka(item.lat), lng: angka(item.lon) }
    const label = labelAlamat(item)
    if (!label || !titikValid(lokasi) || hasil.some((h) => h.label === label)) continue
    hasil.push({ label, lokasi })
    if (hasil.length === MAKS_HASIL) break
  }
  return hasil
}

function labelAlamat(item: Record<string, unknown>): string | null {
  // Di Indonesia, Nominatim memakai `village` untuk kelurahan, `suburb` untuk kecamatan, dan `city_district` untuk kota.
  const alamat = objek(item.address)
  const nama = teks(item.name) ?? teks(item.display_name)?.split(',')[0].trim()
  const kota = teks(alamat?.city_district) ?? teks(alamat?.county) ?? teks(alamat?.city)
  const bagian = [nama, teks(alamat?.village), teks(alamat?.suburb), kota]
  const unik = bagian.filter((b, i): b is string => !!b && bagian.indexOf(b) === i)
  return unik.length ? unik.join(', ') : null
}

const objek = (nilai: unknown) => (typeof nilai === 'object' && nilai !== null ? (nilai as Record<string, unknown>) : null)

const teks = (nilai: unknown) => (typeof nilai === 'string' && nilai.trim() ? nilai.trim() : undefined)

/** Nominatim mengirim koordinat sebagai teks. Yang bukan angka jadi NaN, lalu ditolak `titikValid`. */
const angka = (nilai: unknown) => (typeof nilai === 'string' && nilai.trim() ? Number(nilai) : typeof nilai === 'number' ? nilai : Number.NaN)
