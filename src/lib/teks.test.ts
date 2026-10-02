import { describe, expect, it } from 'vitest'
import { formatJarak, inisial, namaPendek } from './teks'

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

describe('namaPendek', () => {
  it('memakai kata pertama nama', () => {
    expect(namaPendek('Bintang Fabian Putra')).toBe('Bintang')
    expect(namaPendek('  Umar ')).toBe('Umar')
  })

  it('memotong kata pertama yang terlalu panjang', () => {
    expect(namaPendek('Wiraatmadja Kusumaningra')).toBe('Wiraatmad…')
  })
})

describe('formatJarak', () => {
  it('memakai meter di bawah 1 km, dibulatkan ke 10 m', () => {
    expect(formatJarak(0)).toBe('0 m')
    expect(formatJarak(404)).toBe('400 m')
    expect(formatJarak(994)).toBe('990 m')
    expect(formatJarak(996)).toBe('1 km')
  })

  it('memakai kilometer dengan satu angka desimal dan koma', () => {
    expect(formatJarak(1000)).toBe('1 km')
    expect(formatJarak(2345)).toBe('2,3 km')
  })
})
