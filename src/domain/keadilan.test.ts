import { describe, expect, it } from 'vitest'
import { PROFIL_RUTE, menitDariDetik, nilaiKeadilan, peringkatKandidat } from './keadilan'

const kandidat = (osmId: string, menit: number[], jarakDariTengahMeter = 100) => ({
  osmId,
  jarakDariTengahMeter,
  waktuTempuh: menit.map((m, i) => ({ pesertaId: `p${i}`, menit: m })),
})

describe('menitDariDetik', () => {
  it('dibulatkan ke atas, supaya 61 detik tidak tertulis 1 menit', () => {
    expect(menitDariDetik(0)).toBe(0)
    expect(menitDariDetik(60)).toBe(1)
    expect(menitDariDetik(61)).toBe(2)
    expect(menitDariDetik(1439.4)).toBe(24)
  })
})

describe('PROFIL_RUTE', () => {
  it('motor memakai profil mobil karena ORS tidak punya profil motor', () => {
    expect(PROFIL_RUTE).toEqual({ motor: 'driving-car', mobil: 'driving-car', jalan_kaki: 'foot-walking' })
  })
})

describe('nilaiKeadilan', () => {
  it('terlama dan selisih antara yang terlama dan tercepat', () => {
    expect(nilaiKeadilan([24, 27, 22])).toEqual({ terlamaMenit: 27, selisihMenit: 5 })
    expect(nilaiKeadilan([15])).toEqual({ terlamaMenit: 15, selisihMenit: 0 })
  })
})

describe('peringkatKandidat', () => {
  it('waktu tempuh terlama paling pendek menang', () => {
    const hasil = peringkatKandidat([kandidat('lama', [10, 40]), kandidat('adil', [25, 26]), kandidat('sedang', [20, 30])])
    expect(hasil.map((k) => [k.peringkat, k.osmId, k.terlamaMenit, k.selisihMenit])).toEqual([
      [1, 'adil', 26, 1],
      [2, 'sedang', 30, 10],
      [3, 'lama', 40, 30],
    ])
  })

  it('kalau terlamanya seri, selisih paling kecil menang, lalu yang paling dekat ke titik tengah', () => {
    const hasil = peringkatKandidat([
      kandidat('timpang', [10, 30]),
      kandidat('rata-jauh', [28, 30], 900),
      kandidat('rata-dekat', [28, 30], 200),
    ])
    expect(hasil.map((k) => k.osmId)).toEqual(['rata-dekat', 'rata-jauh', 'timpang'])
  })

  it('hanya lima teratas, dengan urutan yang sama setiap kali', () => {
    const banyak = Array.from({ length: 8 }, (_, i) => kandidat(`k${7 - i}`, [20, 20]))
    const hasil = peringkatKandidat(banyak)
    expect(hasil.map((k) => k.osmId)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4'])
    expect(hasil.map((k) => k.peringkat)).toEqual([1, 2, 3, 4, 5])
  })
})
