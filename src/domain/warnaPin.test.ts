import { describe, expect, it } from 'vitest'
import { warnaPin } from './warnaPin'

describe('warnaPin', () => {
  it('orang ke-1 sampai ke-8 dapat warna 1 sampai 8 tanpa aksesori', () => {
    expect(warnaPin(1)).toEqual({ warna: 1, aksesori: 'polos' })
    expect(warnaPin(8)).toEqual({ warna: 8, aksesori: 'polos' })
  })

  it('mulai orang ke-9 warnanya berulang dengan kacamata, lalu pita mulai orang ke-17', () => {
    expect(warnaPin(9)).toEqual({ warna: 1, aksesori: 'kacamata' })
    expect(warnaPin(16)).toEqual({ warna: 8, aksesori: 'kacamata' })
    expect(warnaPin(17)).toEqual({ warna: 1, aksesori: 'pita' })
    expect(warnaPin(24)).toEqual({ warna: 8, aksesori: 'pita' })
  })

  it('24 orang dalam satu room tidak pernah dapat gaya pin yang kembar', () => {
    const gaya = Array.from({ length: 24 }, (_, i) => JSON.stringify(warnaPin(i + 1)))
    expect(new Set(gaya).size).toBe(24)
  })

  it('di atas 24 orang tetap memberi gaya pin, mulai lagi dari awal', () => {
    expect(warnaPin(25)).toEqual(warnaPin(1))
  })

  it('menolak urutan yang bukan bilangan bulat mulai dari 1', () => {
    expect(() => warnaPin(0)).toThrow(RangeError)
    expect(() => warnaPin(-3)).toThrow(RangeError)
    expect(() => warnaPin(1.5)).toThrow(RangeError)
    expect(() => warnaPin(Number.NaN)).toThrow(RangeError)
  })
})
