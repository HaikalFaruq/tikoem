import { describe, expect, it } from 'vitest'
import { pilihanAkhir } from './vote'

const kandidat = (id: string, peringkat: number, pemilih: string[]) => ({ id, peringkat, pemilih })

describe('pilihanAkhir', () => {
  it('vote terbanyak menang walaupun peringkat keadilannya lebih rendah', () => {
    expect(pilihanAkhir([kandidat('adil', 1, ['a']), kandidat('favorit', 3, ['b', 'c'])])).toBe('favorit')
  })

  it('kalau vote seri, peringkat keadilan yang lebih baik menang, tanpa peduli urutan daftar', () => {
    expect(pilihanAkhir([kandidat('kedua', 2, ['a']), kandidat('pertama', 1, ['b'])])).toBe('pertama')
  })

  it('belum ada vote: kandidat paling adil', () => {
    expect(pilihanAkhir([kandidat('ketiga', 3, []), kandidat('pertama', 1, []), kandidat('kedua', 2, [])])).toBe('pertama')
  })

  it('tanpa kandidat: belum ada pilihan', () => {
    expect(pilihanAkhir([])).toBeNull()
  })
})
