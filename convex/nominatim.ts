import { bacaHasilNominatim, rapikanTeksCari, type HasilCariAlamat } from '../src/domain/alamat'
import { PENGENAL } from './pengenal'

const URL_CARI = 'https://nominatim.openstreetmap.org/search'

export type OpsiNominatim = {
  ambil?: typeof fetch
  batasMs?: number
  url?: string
  /** Dipanggil tepat sebelum permintaan dikirim, untuk menunggu giliran di antrean. */
  antre?: () => Promise<void>
}

export class NominatimGagal extends Error {
  override name = 'NominatimGagal'
}

/**
 * Pilihan alamat di Indonesia untuk fitur ketik alamat. Teks yang terlalu pendek langsung menghasilkan daftar kosong.
 * Aturan pakai Nominatim: paling banyak satu permintaan per detik dan tanpa autocomplete,
 * jadi layar hanya memanggil ini saat tombol cari ditekan (Discussions #8).
 */
export async function cariAlamat(
  teks: string,
  { ambil = fetch, batasMs = 8000, url: urlCari = URL_CARI, antre }: OpsiNominatim = {},
): Promise<HasilCariAlamat[]> {
  const q = rapikanTeksCari(teks)
  if (!q) return []
  // Antre setelah teks dicek, jadi teks yang terlalu pendek tidak memakai jatah.
  await antre?.()

  const url = new URL(urlCari)
  url.search = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'id',
    'accept-language': 'id',
    // Lebih dari lima, karena potongan jalan yang labelnya kembar nanti disatukan.
    limit: '10',
  }).toString()

  const henti = new AbortController()
  const jam = setTimeout(() => henti.abort(), batasMs)
  try {
    const jawaban = await ambil(url, { headers: { 'User-Agent': PENGENAL }, signal: henti.signal })
    if (!jawaban.ok) {
      await jawaban.body?.cancel()
      throw new NominatimGagal(`Nominatim menjawab HTTP ${jawaban.status}`)
    }
    return bacaHasilNominatim(await jawaban.json())
  } catch (galat) {
    throw galat instanceof NominatimGagal ? galat : new NominatimGagal(`Nominatim gagal: ${String(galat)}`)
  } finally {
    clearTimeout(jam)
  }
}
