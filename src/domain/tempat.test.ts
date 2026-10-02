import { describe, expect, it } from 'vitest'
import { bacaTempat, kueriOverpass, pilihKandidat, radiusPencarianMeter, ringkasAlamat, type Tempat } from './tempat'

const TEBET = { lat: -6.226, lng: 106.858 }

/** Potongan jawaban Overpass asli di sekitar Tebet (2026-10-03), ditambah elemen yang sengaja tidak lengkap. */
const JAWABAN = {
  version: 0.6,
  elements: [
    { type: 'node', id: 1868699355, lat: -6.2252875, lon: 106.855189, tags: { amenity: 'cafe', name: "Dunkin'", 'addr:street': 'Jalan Tebet Raya' } },
    { type: 'node', id: 2125243378, lat: -6.2245141, lon: 106.8541813, tags: { amenity: 'cafe', name: "Dunkin'" } },
    {
      type: 'way',
      id: 251109083,
      center: { lat: -6.2257555, lon: 106.8568854 },
      tags: { amenity: 'restaurant', name: 'Bebek Kaleyo', 'addr:street': 'Jl. Tebet Raya No.72, RT.2/RW.4,' },
    },
    { type: 'node', id: 4, lat: -6.227, lon: 106.859, tags: { amenity: 'fast_food', name: '  Burger King ' } },
    { type: 'relation', id: 8, center: { lat: -6.2235, lon: 106.8559 }, tags: { shop: 'mall', name: 'Kota Kasablanka' } },
    { type: 'node', id: 5, lat: -6.226, lon: 106.858, tags: { amenity: 'cafe' } },
    { type: 'node', id: 6, lat: -6.226, lon: 106.858, tags: { amenity: 'bank', name: 'Bank' } },
    { type: 'way', id: 7, tags: { shop: 'mall', name: 'Tanpa Koordinat' } },
    'bukan elemen',
  ],
}

/** Tempat buatan di timur Tebet, sejauh `jarak` meter. */
const tempatBuatan = (osmId: string, nama: string, kategori: Tempat['kategori'], jarak: number): Tempat => ({
  osmId,
  nama,
  kategori,
  lokasi: { lat: TEBET.lat, lng: TEBET.lng + jarak / 110_000 },
  alamat: null,
  jarakDariTengahMeter: jarak,
})

describe('radiusPencarianMeter', () => {
  it('30% dari jarak ke orang terjauh, minimal 1 km dan maksimal 3 km', () => {
    expect(radiusPencarianMeter(500)).toBe(1000)
    expect(radiusPencarianMeter(6000)).toBe(1800)
    expect(radiusPencarianMeter(20000)).toBe(3000)
  })
})

describe('kueriOverpass', () => {
  it('mencari kafe, resto, fast food, dan mal bernama di dalam kotak selebar dua kali radius', () => {
    const kueri = kueriOverpass(TEBET, 1500)
    expect(kueri).toMatch(/^\[out:json\]\[timeout:10\];/)
    // Selatan, barat, utara, timur: 1,5 km dari Tebet, dihitung terpisah dengan rumus yang sama.
    const kotak = '(-6.23949,106.84443,-6.21251,106.87157)'
    for (const filter of ['["amenity"="cafe"]', '["amenity"="restaurant"]', '["amenity"="fast_food"]', '["shop"="mall"]']) {
      expect(kueri).toContain(`nwr${filter}["name"]${kotak};`)
    }
    expect(kueri).toMatch(/out center tags;$/)
  })
})

describe('ringkasAlamat', () => {
  it('mengambil nama jalan saja, dengan awalan "Jl."', () => {
    expect(ringkasAlamat('Jalan Lapangan Roos No.49')).toBe('Jl. Lapangan Roos')
    expect(ringkasAlamat('Jl. Tebet Raya No.72, RT.2/RW.4,')).toBe('Jl. Tebet Raya')
    expect(
      ringkasAlamat('Jl. Tebet Timur Dalam II No.28, RT.1/RW.4, Tebet Tim., Kec. Tebet, Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta'),
    ).toBe('Jl. Tebet Timur Dalam II')
    expect(ringkasAlamat('Jl Sawo Kecik V')).toBe('Jl. Sawo Kecik V')
    expect(ringkasAlamat('Jln. Kemang Raya No 12')).toBe('Jl. Kemang Raya')
    expect(ringkasAlamat('Jl.Tebet Utara')).toBe('Jl. Tebet Utara')
    expect(ringkasAlamat('Tebet Raya')).toBe('Tebet Raya')
    expect(ringkasAlamat('Jalan Nologaten')).toBe('Jl. Nologaten')
  })

  it('kosong atau terlalu panjang jadi null, supaya kartu memakai jarak saja', () => {
    expect(ringkasAlamat('')).toBeNull()
    expect(ringkasAlamat(', RT.1/RW.4')).toBeNull()
    expect(ringkasAlamat(`Jalan ${'Panjang '.repeat(6)}`)).toBeNull()
  })
})

describe('bacaTempat', () => {
  it('membaca node, way, dan relation lengkap dengan kategori, alamat, dan jarak', () => {
    const tempat = bacaTempat(JAWABAN, TEBET)
    expect(tempat.map((t) => t.osmId)).toEqual(['node/1868699355', 'node/2125243378', 'way/251109083', 'node/4', 'relation/8'])
    expect(tempat[2]).toEqual({
      osmId: 'way/251109083',
      nama: 'Bebek Kaleyo',
      kategori: 'resto',
      lokasi: { lat: -6.2257555, lng: 106.8568854 },
      alamat: 'Jl. Tebet Raya',
      jarakDariTengahMeter: 126,
    })
    expect(tempat.find((t) => t.osmId === 'node/4')).toMatchObject({ nama: 'Burger King', kategori: 'resto', alamat: null })
    expect(tempat.find((t) => t.osmId === 'relation/8')?.kategori).toBe('mall')
  })

  it('jawaban yang rusak atau kosong menghasilkan daftar kosong', () => {
    for (const rusak of [null, 'teks', {}, { elements: 'bukan daftar' }, { remark: 'runtime error' }]) {
      expect(bacaTempat(rusak, TEBET)).toEqual([])
    }
  })
})

describe('pilihKandidat', () => {
  it('mengurutkan dari yang terdekat dan membuang nama kembar', () => {
    const hasil = pilihKandidat(bacaTempat(JAWABAN, TEBET))
    expect(hasil.map((t) => t.nama)).toEqual(['Bebek Kaleyo', 'Burger King', "Dunkin'", 'Kota Kasablanka'])
    // Dari dua Dunkin' yang berjarak sekitar 140 m, yang lebih dekat ke titik tengah yang dipilih.
    expect(hasil.find((t) => t.nama === "Dunkin'")?.osmId).toBe('node/1868699355')
  })

  it('satu nama cukup satu kandidat, termasuk cabang yang berjauhan', () => {
    const hasil = pilihKandidat([
      tempatBuatan('jauh', 'kopi  kenangan', 'kafe', 900),
      tempatBuatan('dekat', 'Kopi Kenangan', 'kafe', 100),
      tempatBuatan('lain', 'Janji Jiwa', 'kafe', 500),
    ])
    expect(hasil.map((t) => t.osmId)).toEqual(['dekat', 'lain'])
  })

  it('angka di ujung nama tetap dibedakan', () => {
    const hasil = pilihKandidat([tempatBuatan('a', 'Cafe 24', 'kafe', 100), tempatBuatan('b', 'Cafe 99', 'kafe', 200)])
    expect(hasil.map((t) => t.osmId)).toEqual(['a', 'b'])
  })

  it('membatasi tiap kategori dan jumlah total', () => {
    const banyak = [
      ...Array.from({ length: 6 }, (_, i) => tempatBuatan(`kafe${i}`, `Kafe ${i}`, 'kafe', 100 + i)),
      ...Array.from({ length: 6 }, (_, i) => tempatBuatan(`resto${i}`, `Resto ${i}`, 'resto', 200 + i)),
      tempatBuatan('mall0', 'Mal', 'mall', 900),
    ]
    const hasil = pilihKandidat(banyak, { total: 5, perKategori: 2 })
    expect(hasil.map((t) => t.osmId)).toEqual(['kafe0', 'kafe1', 'resto0', 'resto1', 'mall0'])
  })

  it('urutan tetap sama walaupun jaraknya seri', () => {
    const seri = [tempatBuatan('b', 'B', 'kafe', 100), tempatBuatan('a', 'A', 'kafe', 100)]
    expect(pilihKandidat(seri).map((t) => t.osmId)).toEqual(['a', 'b'])
  })
})
