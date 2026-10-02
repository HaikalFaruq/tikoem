import { describe, expect, it } from 'vitest'
import { jarakMeter, samarkan, titikValid } from './lokasi'

describe('jarakMeter', () => {
  it('satu derajat lintang kira-kira 111,2 km', () => {
    expect(jarakMeter({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, 0)
  })

  it('sama dari dua arah dan nol untuk titik yang sama', () => {
    const tebet = { lat: -6.226, lng: 106.858 }
    const kemang = { lat: -6.262, lng: 106.813 }
    expect(jarakMeter(tebet, kemang)).toBeCloseTo(jarakMeter(kemang, tebet), 6)
    expect(jarakMeter(tebet, tebet)).toBe(0)
  })

  it('mengambil jalan terpendek melewati garis bujur 180', () => {
    expect(jarakMeter({ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 })).toBeLessThan(2_300)
  })
})

describe('titikValid', () => {
  it('menerima koordinat bumi yang wajar', () => {
    expect(titikValid({ lat: -6.2088, lng: 106.8456 })).toBe(true)
    expect(titikValid({ lat: 90, lng: -180 })).toBe(true)
  })

  it('menolak koordinat di luar rentang atau bukan angka', () => {
    expect(titikValid({ lat: 91, lng: 0 })).toBe(false)
    expect(titikValid({ lat: 0, lng: 180.5 })).toBe(false)
    expect(titikValid({ lat: Number.NaN, lng: 0 })).toBe(false)
    expect(titikValid({ lat: 0, lng: Number.POSITIVE_INFINITY })).toBe(false)
  })
})

describe('samarkan', () => {
  it('membulatkan ke tiga angka di belakang koma', () => {
    expect(samarkan({ lat: -6.2087634, lng: 106.8455991 })).toEqual({ lat: -6.209, lng: 106.846 })
  })

  it('titik yang sudah disamarkan tidak berubah lagi', () => {
    const sekali = samarkan({ lat: -6.2087634, lng: 106.8455991 })
    expect(samarkan(sekali)).toEqual(sekali)
  })
})
