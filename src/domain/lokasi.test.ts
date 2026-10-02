import { describe, expect, it } from 'vitest'
import { samarkan, titikValid } from './lokasi'

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
