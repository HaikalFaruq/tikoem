import { describe, expect, it } from 'vitest'
import { MAKS_PANJANG_NAMA, rapikanNama } from './peserta'

describe('rapikanNama', () => {
  it('membuang spasi di pinggir dan spasi dobel', () => {
    expect(rapikanNama('  Bintang   Fabian ')).toBe('Bintang Fabian')
  })

  it('menolak nama kosong atau isinya spasi saja', () => {
    expect(rapikanNama('')).toBeNull()
    expect(rapikanNama('   ')).toBeNull()
  })

  it('membatasi 24 karakter dan menghitung emoji sebagai satu karakter', () => {
    expect(rapikanNama('a'.repeat(MAKS_PANJANG_NAMA))).toBe('a'.repeat(MAKS_PANJANG_NAMA))
    expect(rapikanNama('a'.repeat(MAKS_PANJANG_NAMA + 1))).toBeNull()
    expect(rapikanNama('😀'.repeat(MAKS_PANJANG_NAMA))).not.toBeNull()
  })
})
