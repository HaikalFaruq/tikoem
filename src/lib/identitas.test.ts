import { describe, expect, it } from 'vitest'
import { kunciPenyimpanan, uraiIdentitas } from './identitas'

describe('identitas', () => {
  it('menyimpan satu identitas per kode room', () => {
    expect(kunciPenyimpanan('ABC234')).toBe('tikoem:peserta:ABC234')
  })

  it('membaca identitas yang lengkap', () => {
    expect(uraiIdentitas(JSON.stringify({ pesertaId: 'p1', kunci: 'k1' }))).toEqual({ pesertaId: 'p1', kunci: 'k1' })
  })

  it('menolak isi yang kosong, rusak, atau tidak lengkap', () => {
    expect(uraiIdentitas(null)).toBeNull()
    expect(uraiIdentitas('')).toBeNull()
    expect(uraiIdentitas('{bukan json')).toBeNull()
    expect(uraiIdentitas('null')).toBeNull()
    expect(uraiIdentitas(JSON.stringify({ pesertaId: 'p1' }))).toBeNull()
    expect(uraiIdentitas(JSON.stringify({ pesertaId: 'p1', kunci: 42 }))).toBeNull()
    expect(uraiIdentitas(JSON.stringify({ pesertaId: '', kunci: 'k1' }))).toBeNull()
  })
})
