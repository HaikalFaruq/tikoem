import { describe, expect, it } from 'vitest'
import { kontrasWarna } from './warna'

describe('kontrasWarna', () => {
  it('hitam dan putih 21:1, warna yang sama 1:1, dan urutannya tidak berpengaruh', () => {
    expect(kontrasWarna('#000000', '#ffffff')).toBeCloseTo(21)
    expect(kontrasWarna('e30a16', 'e30a16')).toBeCloseTo(1)
    expect(kontrasWarna('ffffff', '45a49e')).toBeCloseTo(kontrasWarna('45a49e', 'ffffff'))
  })

  it('cocok dengan contoh warna jalur dari feed Transitous', () => {
    // Putih di atas merah KRL Bogor lolos batas 4,5:1, putih di atas hijau TJ 9A tidak.
    expect(kontrasWarna('e30a16', 'ffffff')).toBeCloseTo(4.86, 2)
    expect(kontrasWarna('45a49e', 'ffffff')).toBeCloseTo(2.98, 2)
    expect(kontrasWarna('45a49e', '000000')).toBeCloseTo(7.06, 2)
  })
})
