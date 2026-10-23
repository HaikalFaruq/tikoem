import { describe, expect, it } from 'vitest'
import { bukaPada } from './jamBuka'

/** Jam Jakarta pada 22–27 Oktober 2026: Kamis 22 sampai Selasa 27. */
const HARI = { kamis: '2026-10-22', jumat: '2026-10-23', sabtu: '2026-10-24', minggu: '2026-10-25', senin: '2026-10-26', selasa: '2026-10-27' }
const pada = (hari: keyof typeof HARI, jam: string) => Date.parse(`${HARI[hari]}T${jam}+07:00`)

// Semua contoh di bawah diambil dari data OSM Jakarta Selatan dan Pusat (dicek 23 Oktober 2026).
describe('bukaPada', () => {
  it('24/7 selalu buka', () => {
    expect(bukaPada('24/7', pada('senin', '03:00'))).toBe(true)
    expect(bukaPada('00:00-24:00', pada('minggu', '23:59'))).toBe(true)
  })

  it('jam buka setiap hari, dengan jam selesai yang tidak termasuk', () => {
    expect(bukaPada('Mo-Su 10:00-22:00', pada('jumat', '19:00'))).toBe(true)
    expect(bukaPada('Mo-Su 10:00-22:00', pada('jumat', '22:00'))).toBe(false)
    expect(bukaPada('Mo-Su 10:00-22:00', pada('jumat', '09:59'))).toBe(false)
    expect(bukaPada('10:00-22:00', pada('minggu', '21:30'))).toBe(true)
    expect(bukaPada('11:00 - 24:00', pada('sabtu', '23:30'))).toBe(true)
  })

  it('jam buka yang lewat tengah malam, termasuk 00:00 sebagai tengah malam', () => {
    expect(bukaPada('Mo-Su 10:00-01:00', pada('sabtu', '00:30'))).toBe(true)
    expect(bukaPada('Mo-Su 10:00-01:00', pada('sabtu', '01:00'))).toBe(false)
    expect(bukaPada('Mo-Su 19:00-04:00', pada('senin', '03:59'))).toBe(true)
    expect(bukaPada('Mo-Su 10:00-00:00', pada('jumat', '23:59'))).toBe(true)
    expect(bukaPada('Mo-Su 10:00-00:00', pada('sabtu', '00:00'))).toBe(false)
  })

  it('hari yang tidak disebut berarti tutup', () => {
    expect(bukaPada('Tu-Su 11:00-21:00', pada('senin', '12:00'))).toBe(false)
    expect(bukaPada('Tu-Su 11:00-21:00', pada('selasa', '12:00'))).toBe(true)
    expect(bukaPada('Mo-Fr 08:00-18:00', pada('sabtu', '10:00'))).toBe(false)
  })

  it('rentang hari yang melingkar, dan aturan berikutnya menimpa hari yang disebutnya', () => {
    const akhirPekanLebihMalam = 'Su-Th 10:00-23:00; Fr-Sa 10:00-00:00'
    expect(bukaPada(akhirPekanLebihMalam, pada('jumat', '23:30'))).toBe(true)
    expect(bukaPada(akhirPekanLebihMalam, pada('kamis', '23:30'))).toBe(false)
    expect(bukaPada(akhirPekanLebihMalam, pada('minggu', '22:00'))).toBe(true)
    expect(bukaPada('Mo-Su 09:00-22:00; Sa,Su 09:00-23:00', pada('sabtu', '22:30'))).toBe(true)
    expect(bukaPada('Mo-Su 09:00-22:00; Sa,Su 09:00-23:00', pada('jumat', '22:30'))).toBe(false)
    expect(bukaPada('Mo-Fr 08:00-22:00; Sa 10:00-22:00; Su closed', pada('minggu', '12:00'))).toBe(false)
    expect(bukaPada('Mo-Fr 09:00-22:00;Sa,Su 09:00-23:00', pada('minggu', '22:30'))).toBe(true)
  })

  it('aturan tambahan setelah koma menambah jam buka', () => {
    expect(bukaPada('Mo-Fr 08:30-19:00, Su 08:30-13:00', pada('minggu', '10:00'))).toBe(true)
    expect(bukaPada('Mo-Fr 08:30-19:00, Su 08:30-13:00', pada('sabtu', '10:00'))).toBe(false)
    expect(bukaPada('Mo-Th 11:00-23:00, Fr-Su 11:00-23:59; Su 11:00-23:00', pada('minggu', '23:30'))).toBe(false)
    expect(bukaPada('Mo-Th 11:00-23:00, Fr-Su 11:00-23:59; Su 11:00-23:00', pada('sabtu', '23:30'))).toBe(true)
  })

  it('beberapa rentang dalam sehari', () => {
    expect(bukaPada('Mo-Su 07:00-15:00,17:00-24:00', pada('jumat', '16:00'))).toBe(false)
    expect(bukaPada('Mo-Su 07:00-15:00,17:00-24:00', pada('jumat', '18:00'))).toBe(true)
    expect(bukaPada('Mo-Su 00:00-01:00, 08:00-24:00', pada('jumat', '00:30'))).toBe(true)
  })

  it('singkatan hari tiga huruf juga dikenali', () => {
    expect(bukaPada('Mo-Thu 07:00-23:00; Fri-Sun 07:00-24:00', pada('jumat', '23:30'))).toBe(true)
    expect(bukaPada('Mo-Thu 07:00-23:00; Fri-Sun 07:00-24:00', pada('kamis', '23:30'))).toBe(false)
  })

  it('dengan aturan hari libur, yang terlihat tutup jadi tidak tahu', () => {
    expect(bukaPada('Mo-Su,PH 10:00-22:00', pada('jumat', '19:00'))).toBe(true)
    expect(bukaPada('Mo-Su,PH 10:00-22:00', pada('jumat', '23:00'))).toBeNull()
    expect(bukaPada('Mo-Fr 08:30-20:00; Sa,Su 08:00-15:00; PH off', pada('minggu', '16:00'))).toBeNull()
    expect(bukaPada('Mo-Sa 10:00-22:00; PH,Su 08:00-22:00', pada('minggu', '09:00'))).toBe(true)
  })

  it('bentuk yang tidak dikenali berarti tidak tahu', () => {
    for (const nilai of ['sunrise-sunset', 'Mo-Sa 11:00-11:00', 'mo-su 10:00-22:00', 'Mo-Su 10:00-22:00 PH off', 'Mo-Su 10:00-25:61', 'buka terus']) {
      expect(bukaPada(nilai, pada('jumat', '19:00'))).toBeNull()
    }
  })
})
