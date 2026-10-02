import { describe, expect, it } from 'vitest'
import { ALFABET_KODE, MAKS_PESERTA, buatKodeRoom, normalisasiKode, roomPenuh, sudahKedaluwarsa } from './room'

describe('buatKodeRoom', () => {
  it('membuat 6 huruf dari alfabet yang tidak gampang tertukar', () => {
    const kode = buatKodeRoom(Math.random)
    expect(kode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
  })

  it('memakai huruf pertama dan terakhir alfabet di ujung rentang acak', () => {
    expect(buatKodeRoom(() => 0)).toBe('222222')
    expect(buatKodeRoom(() => 0.999999)).toBe(ALFABET_KODE.at(-1)!.repeat(6))
  })
})

describe('normalisasiKode', () => {
  it('menerima huruf kecil dan spasi di pinggir', () => {
    expect(normalisasiKode('  abc234 ')).toBe('ABC234')
  })

  it('menolak panjang yang salah dan huruf yang mudah tertukar', () => {
    expect(normalisasiKode('ABC23')).toBeNull()
    expect(normalisasiKode('ABC2345')).toBeNull()
    for (const kode of ['ABC230', 'ABCO23', 'ABC231', 'ABCI23', 'ABCL23', 'ABC-23']) expect(normalisasiKode(kode)).toBeNull()
  })
})

describe('sudahKedaluwarsa', () => {
  it('kedaluwarsa tepat di batas waktunya', () => {
    expect(sudahKedaluwarsa(1000, 999)).toBe(false)
    expect(sudahKedaluwarsa(1000, 1000)).toBe(true)
  })
})

describe('roomPenuh', () => {
  it('penuh setelah 24 orang pernah gabung', () => {
    expect(roomPenuh(MAKS_PESERTA - 1)).toBe(false)
    expect(roomPenuh(MAKS_PESERTA)).toBe(true)
  })
})
