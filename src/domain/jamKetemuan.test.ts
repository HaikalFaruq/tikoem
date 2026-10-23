import { describe, expect, it } from 'vitest'
import { rapikanJamKetemuan } from './jamKetemuan'

const MENIT = 60_000
const HARI = 24 * 60 * MENIT
const SEKARANG = Date.parse('2026-10-23T12:00:30+07:00')

describe('rapikanJamKetemuan', () => {
  it('membuang detik dan milidetik', () => {
    expect(rapikanJamKetemuan(Date.parse('2026-10-23T19:00:45.250+07:00'), SEKARANG)).toBe(Date.parse('2026-10-23T19:00+07:00'))
  })

  it('menerima jam yang baru lewat paling lama 5 menit, karena jam HP bisa meleset', () => {
    expect(rapikanJamKetemuan(SEKARANG, SEKARANG)).toBe(Date.parse('2026-10-23T12:00+07:00'))
    expect(rapikanJamKetemuan(SEKARANG - 5 * MENIT, SEKARANG)).toBe(Date.parse('2026-10-23T11:55+07:00'))
    expect(rapikanJamKetemuan(SEKARANG - 5 * MENIT - 1, SEKARANG)).toBeNull()
  })

  it('paling jauh 7 hari dari sekarang', () => {
    expect(rapikanJamKetemuan(SEKARANG + 7 * HARI, SEKARANG)).toBe(Date.parse('2026-10-30T12:00+07:00'))
    expect(rapikanJamKetemuan(SEKARANG + 7 * HARI + 1, SEKARANG)).toBeNull()
  })

  it('menolak angka yang bukan waktu', () => {
    expect(rapikanJamKetemuan(Number.NaN, SEKARANG)).toBeNull()
    expect(rapikanJamKetemuan(Number.POSITIVE_INFINITY, SEKARANG)).toBeNull()
  })
})
