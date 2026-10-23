import { describe, expect, it } from 'vitest'
import { lamaPerjalanan, namaJalur, perkiraanBerangkat, teksLewat } from './perjalanan'

const JAM_19 = Date.parse('2026-10-26T19:00+07:00')

describe('perkiraanBerangkat', () => {
  it('motor dan mobil diberi cadangan 10 menit untuk macet', () => {
    expect(perkiraanBerangkat(JAM_19, 30, 'motor')).toEqual({ berangkat: Date.parse('2026-10-26T18:20+07:00'), cadanganMenit: 10 })
    expect(perkiraanBerangkat(JAM_19, 45, 'mobil')).toEqual({ berangkat: Date.parse('2026-10-26T18:05+07:00'), cadanganMenit: 10 })
  })

  it('jalan kaki tanpa cadangan', () => {
    expect(perkiraanBerangkat(JAM_19, 25, 'jalan_kaki')).toEqual({ berangkat: Date.parse('2026-10-26T18:35+07:00'), cadanganMenit: 0 })
  })
})

describe('ringkasan rute di layar', () => {
  it('lama perjalanan dibulatkan ke atas', () => {
    expect(lamaPerjalanan({ berangkat: JAM_19 - 29 * 60_000 - 1, sampai: JAM_19 })).toBe(30)
    expect(lamaPerjalanan({ berangkat: JAM_19 - 29 * 60_000, sampai: JAM_19 })).toBe(29)
  })

  it('menyebut stasiun untuk kereta dan halte untuk bus', () => {
    expect(teksLewat('kereta', 3)).toBe('lewat 3 stasiun')
    expect(teksLewat('bus', 17)).toBe('lewat 17 halte')
    expect(teksLewat('bus', 0)).toBeNull()
  })

  it('chip jalur memakai nama yang dikenal penumpang', () => {
    expect(namaJalur({ jenis: 'kereta', layanan: 'KRL', jalur: 'Commuter Line Bogor' })).toBe('Commuter Line Bogor')
    expect(namaJalur({ jenis: 'bus', layanan: 'TransJakarta', jalur: '9A' })).toBe('TransJakarta 9A')
    // Tanpa nomor jalur, backend mengisi `jalur` dengan nama layanannya.
    expect(namaJalur({ jenis: 'bus', layanan: 'Bus', jalur: 'Bus' })).toBe('Bus')
  })
})
