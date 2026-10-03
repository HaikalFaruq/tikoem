import { describe, expect, it } from 'vitest'
import { formatJarak, namaPendek } from './teks'

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
