import { describe, expect, it } from 'vitest'
import { berangkatTransportasiUmum, dihitungAkhirPekan } from './transportasiUmum'

/** Waktu Jakarta (WIB) dalam milidetik. */
const wib = (teks: string) => Date.parse(`${teks}+07:00`)

describe('berangkatTransportasiUmum', () => {
  it('Senin sampai Jumat berangkat saat itu juga', () => {
    expect(berangkatTransportasiUmum(wib('2026-10-21T14:00'))).toBe(wib('2026-10-21T14:00'))
    expect(berangkatTransportasiUmum(wib('2026-10-23T23:59'))).toBe(wib('2026-10-23T23:59'))
    expect(berangkatTransportasiUmum(wib('2026-10-26T00:00'))).toBe(wib('2026-10-26T00:00'))
  })

  it('Sabtu dan Minggu memakai Senin berikutnya di jam yang sama, karena feed KRL hanya berisi jadwal hari kerja', () => {
    expect(berangkatTransportasiUmum(wib('2026-10-24T00:00'))).toBe(wib('2026-10-26T00:00'))
    expect(berangkatTransportasiUmum(wib('2026-10-24T10:00'))).toBe(wib('2026-10-26T10:00'))
    expect(berangkatTransportasiUmum(wib('2026-10-25T23:30'))).toBe(wib('2026-10-26T23:30'))
  })
})

describe('dihitungAkhirPekan', () => {
  it('Sabtu dan Minggu menurut jam Jakarta, bukan jam UTC', () => {
    expect(dihitungAkhirPekan(wib('2026-10-24T00:30'))).toBe(true)
    expect(dihitungAkhirPekan(wib('2026-10-25T23:59'))).toBe(true)
    // Jumat 23.30 WIB masih Jumat, walau di UTC sudah Jumat sore. Senin 00.30 WIB masih Minggu di UTC.
    expect(dihitungAkhirPekan(wib('2026-10-23T23:30'))).toBe(false)
    expect(dihitungAkhirPekan(wib('2026-10-26T00:30'))).toBe(false)
  })

  it('belum ada hasil berarti tidak ada catatan', () => {
    expect(dihitungAkhirPekan(null)).toBe(false)
  })
})
