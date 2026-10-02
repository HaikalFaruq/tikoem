import { describe, expect, it } from 'vitest'
import { inisial } from './teks'

describe('inisial', () => {
  it('mengambil huruf pertama dalam huruf besar', () => {
    expect(inisial('bintang')).toBe('B')
    expect(inisial('  umar ')).toBe('U')
  })

  it('menjaga huruf beraksen dan emoji tetap utuh', () => {
    expect(inisial('élan')).toBe('É')
    expect(inisial('🧑‍🚀 Raka')).toBe('🧑‍🚀')
  })

  it('memberi tanda tanya untuk nama kosong', () => {
    expect(inisial('')).toBe('?')
    expect(inisial('   ')).toBe('?')
  })
})
