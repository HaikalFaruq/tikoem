import { describe, expect, it } from 'vitest'
import { jedaBertahap, jedaPermintaan, sisaWaktu } from './waktu'

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

describe('jedaBertahap', () => {
  it('mulai satu menit setelah 429 yang pertama', () => {
    expect(jedaBertahap(10_000, null)).toEqual({ sampai: 10_000 + MENIT, lamaMs: MENIT })
  })

  it('dua kali lipat kalau 429 datang lagi tidak lama setelah jeda habis, paling lama 15 menit', () => {
    const pertama = jedaBertahap(0, null)
    const kedua = jedaBertahap(pertama.sampai + 30_000, pertama)
    expect(kedua).toEqual({ sampai: pertama.sampai + 30_000 + 2 * MENIT, lamaMs: 2 * MENIT })

    let jeda = kedua
    for (let i = 0; i < 10; i++) jeda = jedaBertahap(jeda.sampai + 1000, jeda)
    expect(jeda.lamaMs).toBe(15 * MENIT)
  })

  it('kembali ke satu menit kalau 429 berikutnya datang lama setelah jeda sebelumnya habis', () => {
    expect(jedaBertahap(60 * MENIT, { sampai: 0, lamaMs: 8 * MENIT })).toEqual({ sampai: 61 * MENIT, lamaMs: MENIT })
  })

  it('429 dari permintaan yang terkirim sebelum jeda tercatat tidak memperpanjang jeda', () => {
    const jeda = { sampai: 50_000, lamaMs: MENIT }
    expect(jedaBertahap(20_000, jeda)).toEqual(jeda)
  })

  it('mengikuti Retry-After kalau layanan meminta jeda yang lebih lama', () => {
    expect(jedaBertahap(0, null, 5 * MENIT)).toEqual({ sampai: 5 * MENIT, lamaMs: MENIT })
    expect(jedaBertahap(0, null, 10_000)).toEqual({ sampai: MENIT, lamaMs: MENIT })
    expect(jedaBertahap(20_000, { sampai: 50_000, lamaMs: MENIT }, 5 * MENIT)).toEqual({ sampai: 20_000 + 5 * MENIT, lamaMs: MENIT })
  })
})
