import { describe, expect, it } from 'vitest'
import { jarakMeter } from './lokasi'
import { batasPeta, lingkaranGeo, sebarPinBerdekatan } from './peta'

const TEBET = { lat: -6.227, lng: 106.854 }

describe('lingkaranGeo', () => {
  it('membuat cincin tertutup yang semua titiknya berjarak radius dari pusat', () => {
    const cincin = lingkaranGeo(TEBET, 110, 32)
    expect(cincin).toHaveLength(33)
    expect(cincin.at(-1)).toEqual(cincin[0])
    for (const [lng, lat] of cincin) expect(jarakMeter(TEBET, { lat, lng })).toBeCloseTo(110, 0)
  })
})

const posisiAkhir = (titik: { x: number; y: number }[]) =>
  sebarPinBerdekatan(titik).map((g, i) => ({ x: titik[i].x + g.x, y: titik[i].y + g.y }))

describe('sebarPinBerdekatan', () => {
  it('tidak menggeser pin yang berjauhan di layar', () => {
    expect(sebarPinBerdekatan([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ])
  })

  it('menyebar pin yang bertumpuk atau berdekatan sampai tidak saling menutupi', () => {
    const akhir = posisiAkhir([{ x: 50, y: 50 }, { x: 200, y: 200 }, { x: 50, y: 50 }, { x: 54, y: 47 }])
    expect(akhir[1]).toEqual({ x: 200, y: 200 })
    const kelompok = [akhir[0], akhir[2], akhir[3]]
    for (let i = 0; i < kelompok.length; i++) {
      for (let j = i + 1; j < kelompok.length; j++) {
        expect(Math.hypot(kelompok[i].x - kelompok[j].x, kelompok[i].y - kelompok[j].y)).toBeGreaterThan(20)
      }
    }
  })

  it('menyebar kelompok di sekitar pin pertamanya, tidak jauh dari lokasi aslinya', () => {
    const akhir = posisiAkhir([{ x: 50, y: 50 }, { x: 52, y: 51 }])
    for (const a of akhir) expect(Math.hypot(a.x - 50, a.y - 50)).toBeCloseTo(18, 0)
  })
})

describe('batasPeta', () => {
  it('memuat semua titik dalam urutan [barat, selatan], [timur, utara]', () => {
    expect(batasPeta([TEBET, { lat: -6.15, lng: 106.9 }, { lat: -6.3, lng: 106.8 }])).toEqual([
      [106.8, -6.3],
      [106.9, -6.15],
    ])
  })

  it('kosong kalau belum ada titik', () => {
    expect(batasPeta([])).toBeNull()
  })
})
