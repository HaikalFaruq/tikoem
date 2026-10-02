import { describe, expect, it } from 'vitest'
import { bacaHasilNominatim, rapikanTeksCari } from './alamat'

const kasablanka = (type: string, extra: Record<string, string>) => ({
  lat: '-6.2232551',
  lon: '106.8426972',
  name: 'Kota Kasablanka',
  type,
  display_name: 'Kota Kasablanka, Kavling 88, Jalan Raya Casablanca, RW 05, Menteng Dalam, Tebet, Jakarta Selatan, Daerah Khusus Ibukota Jakarta, 12870, Indonesia',
  address: {
    ...extra,
    village: 'Menteng Dalam',
    suburb: 'Tebet',
    city_district: 'Jakarta Selatan',
    city: 'Daerah Khusus Ibukota Jakarta',
    postcode: '12870',
    country: 'Indonesia',
  },
})

const tebetRaya = (lat: string, village: string) => ({
  lat,
  lon: '106.8541',
  name: 'Jalan Tebet Raya',
  type: 'secondary',
  display_name: `Jalan Tebet Raya, RW 01, ${village}, Tebet, Jakarta Selatan, Daerah Khusus Ibukota Jakarta, 12830, Indonesia`,
  address: { road: 'Jalan Tebet Raya', city_block: 'RW 01', village, suburb: 'Tebet', city_district: 'Jakarta Selatan' },
})

describe('rapikanTeksCari', () => {
  it('merapikan spasi dan menolak teks yang terlalu pendek atau terlalu panjang', () => {
    expect(rapikanTeksCari('  kota   kasablanka ')).toBe('kota kasablanka')
    expect(rapikanTeksCari('ab')).toBeNull()
    expect(rapikanTeksCari('a'.repeat(101))).toBeNull()
  })
})

describe('bacaHasilNominatim', () => {
  it('memakai nama, kelurahan, kecamatan, dan kota, tanpa RW dan kode pos', () => {
    // Bentuk jawaban Nominatim asli untuk "Kota Kasablanka" (2026-10-03).
    const hasil = bacaHasilNominatim([kasablanka('mall', { shop: 'Kota Kasablanka', city_block: 'RW 05' })])
    expect(hasil).toEqual([
      { label: 'Kota Kasablanka, Menteng Dalam, Tebet, Jakarta Selatan', lokasi: { lat: -6.2232551, lng: 106.8426972 } },
    ])
  })

  it('menyatukan potongan jalan yang labelnya kembar', () => {
    const hasil = bacaHasilNominatim([
      tebetRaya('-6.2301', 'Tebet Timur'),
      tebetRaya('-6.2312', 'Tebet Timur'),
      tebetRaya('-6.2289', 'Tebet Barat'),
      tebetRaya('-6.2254', 'Menteng Dalam'),
    ])
    expect(hasil.map((h) => h.label)).toEqual([
      'Jalan Tebet Raya, Tebet Timur, Tebet, Jakarta Selatan',
      'Jalan Tebet Raya, Tebet Barat, Tebet, Jakarta Selatan',
      'Jalan Tebet Raya, Menteng Dalam, Tebet, Jakarta Selatan',
    ])
    expect(hasil[0].lokasi.lat).toBe(-6.2301)
  })

  it('memakai potongan pertama display_name kalau name kosong, dan kota kalau tidak ada city_district', () => {
    const [hasil] = bacaHasilNominatim([
      { lat: '-6.9147', lon: '107.6098', display_name: 'Gedung Sate, Jalan Diponegoro, Bandung, Jawa Barat, Indonesia', address: { city: 'Bandung' } },
    ])
    expect(hasil.label).toBe('Gedung Sate, Bandung')
  })

  it('paling banyak lima pilihan', () => {
    const banyak = Array.from({ length: 8 }, (_, i) => tebetRaya(`-6.23${i}`, `Kelurahan ${i}`))
    expect(bacaHasilNominatim(banyak)).toHaveLength(5)
  })

  it('melewati koordinat yang tidak masuk akal dan jawaban yang rusak', () => {
    expect(bacaHasilNominatim([{ ...tebetRaya('', 'Tebet Timur') }, { ...tebetRaya('95', 'Tebet Barat') }, null, 'teks'])).toEqual([])
    expect(bacaHasilNominatim({ error: 'Bad request' })).toEqual([])
  })
})
