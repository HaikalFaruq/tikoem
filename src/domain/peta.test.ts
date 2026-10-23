import { describe, expect, it } from 'vitest'
import { jarakMeter } from './lokasi'
import { batasPeta, lingkaranGeo, pisahkanPenanda, titikAwalPilih, type KotakPenanda } from './peta'

const TEBET = { lat: -6.227, lng: 106.854 }

describe('lingkaranGeo', () => {
  it('membuat cincin tertutup yang semua titiknya berjarak radius dari pusat', () => {
    const cincin = lingkaranGeo(TEBET, 110, 32)
    expect(cincin).toHaveLength(33)
    expect(cincin.at(-1)).toEqual(cincin[0])
    for (const [lng, lat] of cincin) expect(jarakMeter(TEBET, { lat, lng })).toBeCloseTo(110, 0)
  })
})

const posisiAkhir = (kotak: KotakPenanda[]) => pisahkanPenanda(kotak).map((g, i) => ({ ...kotak[i], x: kotak[i].x + g.x, y: kotak[i].y + g.y }))

/** Dua kotak yang jangkarnya di tengah bawah bertumpuk atau tidak. */
const bertumpuk = (a: KotakPenanda, b: KotakPenanda) =>
  Math.abs(a.x - b.x) < (a.lebar + b.lebar) / 2 && Math.abs(a.y - a.tinggi / 2 - (b.y - b.tinggi / 2)) < (a.tinggi + b.tinggi) / 2

const angka = (x: number, y: number): KotakPenanda => ({ x, y, lebar: 28, tinggi: 28 })

describe('pisahkanPenanda', () => {
  it('tidak menggeser penanda yang berjauhan di layar', () => {
    expect(pisahkanPenanda([angka(0, 0), angka(100, 0)])).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ])
  })

  it('memisahkan penanda di titik yang sama dengan cara yang selalu sama', () => {
    const akhir = posisiAkhir([angka(50, 50), angka(50, 50)])
    expect(bertumpuk(akhir[0], akhir[1])).toBe(false)
    expect(akhir[0].x).toBeLessThan(akhir[1].x)
    expect(pisahkanPenanda([angka(50, 50), angka(50, 50)])).toEqual(pisahkanPenanda([angka(50, 50), angka(50, 50)]))
  })

  it('memisahkan kerumunan kandidat, pin teman berlabel, dan bintang berlabel lebar sampai tidak ada yang tertutup', () => {
    // Bentuk room uji panel promo #77: lima kandidat, satu stasiun, dan pin Sari dalam lingkaran ~40 px.
    const kotak: KotakPenanda[] = [
      { x: 140, y: 120, lebar: 144, tinggi: 54, diam: true },
      angka(150, 118),
      angka(158, 124),
      { x: 146, y: 126, lebar: 40, tinggi: 28 },
      angka(170, 130),
      angka(165, 140),
      { x: 152, y: 132, lebar: 36, tinggi: 50 },
      { x: 300, y: 40, lebar: 48, tinggi: 50 },
    ]
    const akhir = posisiAkhir(kotak)
    for (let i = 0; i < akhir.length; i++) {
      for (let j = i + 1; j < akhir.length; j++) expect(bertumpuk(akhir[i], akhir[j]), `${i} dan ${j}`).toBe(false)
    }
    // Bintang tempat kumpul tetap tepat di tempatnya, dan pin yang jauh tidak ikut bergeser.
    expect(akhir[0]).toMatchObject({ x: 140, y: 120 })
    expect(akhir[7]).toMatchObject({ x: 300, y: 40 })
  })

  it('tetap dekat dengan lokasi aslinya', () => {
    const akhir = posisiAkhir([angka(50, 50), angka(52, 51)])
    for (const a of akhir) expect(Math.hypot(a.x - 50, a.y - 50)).toBeLessThan(25)
  })
})

describe('batasPeta', () => {
  it('memuat semua titik dalam urutan [barat, selatan], [timur, utara]', () => {
    expect(batasPeta([TEBET, { lat: -6.15, lng: 106.9 }, { lat: -6.3, lng: 106.8 }])).toEqual([
      [106.8, -6.3],
      [106.9, -6.15],
    ])
  })

  it('kosong kalau belum ada titik', () => {
    expect(batasPeta([])).toBeNull()
  })
})

describe('titikAwalPilih', () => {
  const KOKAS = { lat: -6.224, lng: 106.843 }

  it('mulai dari lokasiku kalau sudah ada', () => {
    expect(titikAwalPilih(TEBET, [KOKAS])).toEqual(TEBET)
  })

  it('kalau belum, dari titik tengah lokasi teman', () => {
    expect(titikAwalPilih(null, [TEBET])).toEqual(TEBET)
    const tengah = titikAwalPilih(null, [TEBET, KOKAS])!
    expect(jarakMeter(tengah, TEBET)).toBeCloseTo(jarakMeter(tengah, KOKAS), 0)
  })

  it('null kalau belum ada lokasi siapa pun', () => {
    expect(titikAwalPilih(null, [])).toBeNull()
  })
})
