import { describe, expect, it } from 'vitest'
import { LINK_TRAKTIR, waktunyaTraktir } from './traktir'

describe('waktunyaTraktir', () => {
  const dasar = { menghitung: false, putaran: 0, putaranAwal: 0, sudahMuncul: false }

  it('muncul saat HP ini melihat tempat sedang dicari, termasuk HP yang baru membuka room di tengah pencarian', () => {
    expect(waktunyaTraktir({ ...dasar, menghitung: true, putaran: 1 })).toBe(true)
    expect(waktunyaTraktir({ ...dasar, menghitung: true, putaran: 1, putaranAwal: 1 })).toBe(true)
  })

  it('tetap muncul kalau status menghitung terlewat, asal putarannya naik setelah room dibuka', () => {
    expect(waktunyaTraktir({ ...dasar, putaran: 1 })).toBe(true)
    expect(waktunyaTraktir({ ...dasar, putaran: 3, putaranAwal: 2 })).toBe(true)
  })

  it('tidak muncul sebelum tempat dicari, atau saat room dibuka setelah hasilnya keluar', () => {
    expect(waktunyaTraktir(dasar)).toBe(false)
    expect(waktunyaTraktir({ ...dasar, putaran: 2, putaranAwal: 2 })).toBe(false)
  })

  it('sekali per room: tidak muncul lagi saat hitung ulang', () => {
    expect(waktunyaTraktir({ ...dasar, menghitung: true, putaran: 2, putaranAwal: 1, sudahMuncul: true })).toBe(false)
  })
})

it('link traktir ke halaman Sociabuzz lewat https', () => {
  expect(new URL(LINK_TRAKTIR).protocol).toBe('https:')
  expect(new URL(LINK_TRAKTIR).hostname).toBe('sociabuzz.com')
})
