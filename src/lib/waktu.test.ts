import { describe, expect, it } from 'vitest'
import { jedaPermintaan, sisaWaktu } from './waktu'

const MENIT = 60_000

describe('sisaWaktu', () => {
  it('menyebut jam untuk sisa satu jam atau lebih, dibulatkan ke bawah', () => {
    expect(sisaWaktu(24 * 60 * MENIT)).toBe('24 jam lagi')
    expect(sisaWaktu(23 * 60 * MENIT + 59 * MENIT)).toBe('23 jam lagi')
    expect(sisaWaktu(60 * MENIT)).toBe('1 jam lagi')
  })

  it('menyebut menit untuk sisa di bawah satu jam', () => {
    expect(sisaWaktu(59 * MENIT + 59_000)).toBe('59 menit lagi')
    expect(sisaWaktu(MENIT)).toBe('1 menit lagi')
    expect(sisaWaktu(30_000)).toBe('kurang dari 1 menit lagi')
  })

  it('menyebut sudah berakhir kalau waktunya habis', () => {
    expect(sisaWaktu(0)).toBe('sudah berakhir')
    expect(sisaWaktu(-5 * MENIT)).toBe('sudah berakhir')
  })
})

describe('jedaPermintaan', () => {
  it('menunggu tundaan biasa kalau belum pernah meminta atau permintaan terakhir sudah lama', () => {
    expect(jedaPermintaan(10_000, null, 1100, 600)).toBe(600)
    expect(jedaPermintaan(10_000, 5_000, 1100, 600)).toBe(600)
  })

  it('menunggu lebih lama supaya jarak dari permintaan terakhir paling sedikit jarakMin', () => {
    expect(jedaPermintaan(10_000, 9_800, 1100, 600)).toBe(900)
  })
})
