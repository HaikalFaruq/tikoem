import { describe, expect, it } from 'vitest'
import { jarakMeter, type Titik } from './lokasi'
import { titikTengah } from './titikTengah'

const KEMANG = { lat: -6.262, lng: 106.813 }
const KEMANG_SEBELAH = { lat: -6.261, lng: 106.814 }
const KELAPA_GADING = { lat: -6.158, lng: 106.905 }
const TEBET = { lat: -6.226, lng: 106.858 }
const TANGERANG = { lat: -6.178, lng: 106.63 }
const BEKASI = { lat: -6.238, lng: 107 }
const DEPOK = { lat: -6.402, lng: 106.794 }

const jarakTerjauh = (dari: Titik, lokasi: readonly Titik[]) => Math.max(...lokasi.map((t) => jarakMeter(dari, t)))

function hitung(lokasi: readonly Titik[]) {
  const hasil = titikTengah(lokasi)
  if (!hasil) throw new Error('titik tengah kosong')
  return hasil
}

describe('titikTengah', () => {
  it('kosong kalau belum ada yang berbagi lokasi', () => {
    expect(titikTengah([])).toBeNull()
  })

  it('satu orang: titiknya sendiri', () => {
    expect(hitung([TEBET])).toEqual({ titik: TEBET, radiusMeter: 0 })
  })

  it('dua orang: tepat di tengah-tengah', () => {
    const { titik, radiusMeter } = hitung([KEMANG, KELAPA_GADING])
    expect(Math.abs(jarakMeter(titik, KEMANG) - jarakMeter(titik, KELAPA_GADING))).toBeLessThan(1)
    expect(radiusMeter).toBeCloseTo(jarakMeter(KEMANG, KELAPA_GADING) / 2, -1)
  })

  it('dua tetangga dan satu orang jauh: tidak condong ke yang berdekatan', () => {
    const lokasi = [KEMANG, KEMANG_SEBELAH, KELAPA_GADING]
    const { titik, radiusMeter } = hitung(lokasi)

    // Yang paling jauh dan tetangga yang paling jauh darinya menempuh jarak garis lurus yang sama.
    expect(Math.abs(jarakMeter(titik, KELAPA_GADING) - jarakMeter(titik, KEMANG))).toBeLessThan(1)
    expect(jarakTerjauh(titik, lokasi)).toBeCloseTo(radiusMeter, -1)

    // Rata-rata koordinat membuat orang yang jauh menempuh lebih dari 1,3 kali jarak itu.
    const rataRata = {
      lat: lokasi.reduce((s, t) => s + t.lat, 0) / lokasi.length,
      lng: lokasi.reduce((s, t) => s + t.lng, 0) / lokasi.length,
    }
    expect(jarakTerjauh(rataRata, lokasi)).toBeGreaterThan(1.3 * radiusMeter)
  })

  it('segitiga tumpul: di tengah sisi terpanjang, orang ketiga ada di dalam lingkaran', () => {
    const { titik, radiusMeter } = hitung([TANGERANG, TEBET, BEKASI])
    expect(jarakMeter(titik, TANGERANG)).toBeCloseTo(radiusMeter, -1)
    expect(jarakMeter(titik, BEKASI)).toBeCloseTo(radiusMeter, -1)
    expect(jarakMeter(titik, TEBET)).toBeLessThan(radiusMeter - 100)
  })

  it('segitiga lancip: ketiga orang sama jauhnya', () => {
    const lokasi = [DEPOK, KELAPA_GADING, TANGERANG]
    const { titik, radiusMeter } = hitung(lokasi)
    for (const t of lokasi) expect(jarakMeter(titik, t)).toBeCloseTo(radiusMeter, -1)
  })

  it('24 orang: semua di dalam lingkaran, dan titiknya tidak bisa digeser jadi lebih adil', () => {
    let benih = 20261003
    const acak = () => (benih = (benih * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const lokasi = Array.from({ length: 24 }, () => ({
      lat: Math.round((-6.4 + acak() * 0.3) * 1000) / 1000,
      lng: Math.round((106.65 + acak() * 0.35) * 1000) / 1000,
    }))
    const { titik, radiusMeter } = hitung(lokasi)

    const jarak = lokasi.map((t) => jarakMeter(titik, t))
    expect(Math.max(...jarak)).toBe(radiusMeter)
    // Lingkaran terkecil selalu menyentuh minimal dua orang di tepinya.
    expect(jarak.filter((d) => d > radiusMeter - 5).length).toBeGreaterThanOrEqual(2)

    // Digeser sekitar 50 m ke delapan arah, orang yang paling jauh tidak jadi lebih dekat (selain galat proyeksi beberapa meter).
    for (let i = 0; i < 8; i++) {
      const sudut = (i * Math.PI) / 4
      const digeser = { lat: titik.lat + 0.00045 * Math.cos(sudut), lng: titik.lng + 0.00045 * Math.sin(sudut) }
      expect(jarakTerjauh(digeser, lokasi)).toBeGreaterThanOrEqual(radiusMeter - 3)
    }
  })

  it('lokasi yang sama persis karena pembulatan tetap menghasilkan titik itu', () => {
    expect(hitung([TEBET, { ...TEBET }, { ...TEBET }])).toEqual({ titik: TEBET, radiusMeter: 0 })
  })

  it('tetap berdekatan di dua sisi garis bujur 180', () => {
    const { titik, radiusMeter } = hitung([
      { lat: 0, lng: 179.99 },
      { lat: 0, lng: -179.99 },
    ])
    expect(Math.abs(titik.lng)).toBeGreaterThan(179.99)
    expect(radiusMeter).toBeCloseTo(jarakMeter({ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 }) / 2, -1)
  })
})
