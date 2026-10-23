import { describe, expect, it } from 'vitest'
import { galatIsianJam, isianAwal, labelJamKetemuan, pilihanHari, rapikanJamKetemuan, teksJamKetemuan, waktuDariIsian } from './jamKetemuan'

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

describe('teksJamKetemuan dan labelJamKetemuan', () => {
  const senin = Date.parse('2026-10-26T19:00+07:00')

  it('teks untuk grup selalu menyebut hari dan tanggal', () => {
    expect(teksJamKetemuan(senin)).toBe('Senin, 26 Okt · 19.00 WIB')
  })

  it('di layar, hari ini dan besok disebut begitu menurut tanggal di Jakarta', () => {
    expect(labelJamKetemuan(senin, Date.parse('2026-10-26T08:00+07:00'))).toBe('Hari ini · 19.00 WIB')
    // Pukul 23.30 WIB Minggu, sudah Minggu sore di UTC: besoknya tetap Senin.
    expect(labelJamKetemuan(senin, Date.parse('2026-10-25T23:30+07:00'))).toBe('Besok · 19.00 WIB')
    expect(labelJamKetemuan(senin, SEKARANG)).toBe('Senin, 26 Okt · 19.00 WIB')
  })
})

describe('isian jam ketemuan', () => {
  it('pilihan hari dari hari ini sampai 6 hari lagi', () => {
    expect(pilihanHari(SEKARANG)).toEqual([
      { nilai: '2026-10-23', label: 'Hari ini' },
      { nilai: '2026-10-24', label: 'Besok' },
      { nilai: '2026-10-25', label: 'Min 25' },
      { nilai: '2026-10-26', label: 'Sen 26' },
      { nilai: '2026-10-27', label: 'Sel 27' },
      { nilai: '2026-10-28', label: 'Rab 28' },
      { nilai: '2026-10-29', label: 'Kam 29' },
    ])
  })

  it('isian dibaca sebagai WIB', () => {
    expect(waktuDariIsian({ tanggal: '2026-10-26', jam: '19:00' })).toBe(Date.parse('2026-10-26T12:00Z'))
    expect(waktuDariIsian({ tanggal: '2026-10-26', jam: '' })).toBeNaN()
  })

  it('mulai dari jam ketemuan yang sudah ada', () => {
    expect(isianAwal(Date.parse('2026-10-26T07:30+07:00'), SEKARANG)).toEqual({ tanggal: '2026-10-26', jam: '07:30' })
  })

  it('tanpa jam ketemuan, mulai pukul 19.00 hari ini, atau besok kalau sudah kurang dari 30 menit lagi', () => {
    expect(isianAwal(null, SEKARANG)).toEqual({ tanggal: '2026-10-23', jam: '19:00' })
    expect(isianAwal(null, Date.parse('2026-10-23T18:30+07:00'))).toEqual({ tanggal: '2026-10-23', jam: '19:00' })
    expect(isianAwal(null, Date.parse('2026-10-23T18:31+07:00'))).toEqual({ tanggal: '2026-10-24', jam: '19:00' })
  })

  it('menolak isian yang juga akan ditolak backend', () => {
    expect(galatIsianJam({ tanggal: '2026-10-23', jam: '19:00' }, SEKARANG)).toBeNull()
    expect(galatIsianJam({ tanggal: '2026-10-23', jam: '' }, SEKARANG)).toBe('Isi jamnya dulu.')
    expect(galatIsianJam({ tanggal: '2026-10-23', jam: '08:00' }, SEKARANG)).toBe('Jam itu sudah lewat. Pilih jam lain.')
    expect(galatIsianJam({ tanggal: '2026-10-30', jam: '13:00' }, SEKARANG)).toBe('Paling jauh 7 hari dari sekarang. Pilih hari lain.')
  })
})
