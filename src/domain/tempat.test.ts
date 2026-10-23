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

/**
 * Potongan jawaban Overpass asli di sekitar Tebet dan Pancoran (2026-10-21): stasiun KRL, halte TransJakarta yang dipecah
 * per arah, dan halte yang namanya diambil dari stasiun. Sisanya harus dilewati: stasiun LRT dan MRT, pool bus tanpa
 * `network`, area stasiun tanpa tag `railway`, dan stasiun Whoosh buatan.
 */
const JAWABAN_STASIUN = {
  elements: [
    {
      type: 'node',
      id: 3056674105,
      lat: -6.2263977,
      lon: 106.8584389,
      tags: { name: 'Tebet', network: 'KAI Commuter', public_transport: 'station', railway: 'station', train: 'yes' },
    },
    {
      type: 'node',
      id: 3415431318,
      lat: -6.2416725,
      lon: 106.8372822,
      tags: { amenity: 'bus_station', bus: 'yes', name: 'Pancoran Arah Barat', network: 'Transjakarta', public_transport: 'platform' },
    },
    {
      type: 'node',
      id: 6249633581,
      lat: -6.2415527,
      lon: 106.8380523,
      tags: { amenity: 'bus_station', bus: 'yes', name: 'Pancoran Arah Timur', network: 'Transjakarta', public_transport: 'platform' },
    },
    {
      type: 'node',
      id: 11744682976,
      lat: -6.2154315,
      lon: 106.8693599,
      tags: { amenity: 'bus_station', bus: 'yes', name: 'Stasiun Jatinegara', network: 'Transjakarta', public_transport: 'platform' },
    },
    {
      type: 'node',
      id: 6720467132,
      lat: -6.2421415,
      lon: 106.8385146,
      tags: { light_rail: 'yes', name: 'Pancoran', network: 'LRT Jabodebek', public_transport: 'station', railway: 'station', station: 'light_rail' },
    },
    {
      type: 'node',
      id: 6196107720,
      lat: -6.2007957,
      lon: 106.822788,
      tags: { name: 'Dukuh Atas BNI', network: 'MRT Jakarta', public_transport: 'station', railway: 'station', station: 'subway', subway: 'yes' },
    },
    {
      type: 'node',
      id: 11662373378,
      lat: -6.2577848,
      lon: 106.8691837,
      tags: { amenity: 'bus_station', bus: 'yes', name: 'Pool Primajasa Cililitan', public_transport: 'station' },
    },
    { type: 'way', id: 481951535, center: { lat: -6.214898, lon: 106.8702862 }, tags: { name: 'Stasiun Jatinegara', public_transport: 'station' } },
    { type: 'node', id: 9, lat: -6.2466, lon: 106.8869, tags: { name: 'Halim', network: 'Whoosh', railway: 'station' } },
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
    expect(kueri).not.toMatch(/railway|bus_station/)
  })

  it('ikut mencari stasiun KRL dan halte TransJakarta kalau diminta', () => {
    const kueri = kueriOverpass(TEBET, 1500, { stasiun: true })
    const kotak = '(-6.23949,106.84443,-6.21251,106.87157)'
    expect(kueri).toContain(`nwr["amenity"="cafe"]["name"]${kotak};`)
    expect(kueri).toContain(`nwr["railway"~"^(station|halt)$"]["network"~"^KAI",i]["name"]${kotak};`)
    expect(kueri).toContain(`nwr["amenity"="bus_station"]["network"~"^Transjakarta",i]["name"]${kotak};`)
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

/** Kafe di dekat Tebet dengan tag `opening_hours` kalau diisi. */
const kafe = (id: number, jamBuka?: string) => ({
  type: 'node',
  id,
  lat: -6.2253,
  lon: 106.8552,
  tags: { amenity: 'cafe', name: `Kafe ${id}`, ...(jamBuka ? { opening_hours: jamBuka } : {}) },
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

  it('stasiun KRL dan halte TransJakarta jadi kategori stasiun, dengan nama yang menyebut jenisnya', () => {
    expect(bacaTempat(JAWABAN_STASIUN, TEBET).map((t) => [t.osmId, t.nama, t.kategori])).toEqual([
      ['node/3056674105', 'Stasiun Tebet', 'stasiun'],
      ['node/3415431318', 'Halte Pancoran', 'stasiun'],
      ['node/6249633581', 'Halte Pancoran', 'stasiun'],
      ['node/11744682976', 'Halte Stasiun Jatinegara', 'stasiun'],
    ])
  })

  it('nama yang sudah diawali jenisnya tidak diberi awalan lagi, dan huruf besar di network tidak berpengaruh', () => {
    const jawaban = {
      elements: [
        { type: 'node', id: 1, lat: -6.21, lon: 106.85, tags: { railway: 'station', network: 'KAI Commuter', name: 'Stasiun Manggarai' } },
        { type: 'node', id: 2, lat: -6.23, lon: 106.83, tags: { amenity: 'bus_station', network: 'TransJakarta', name: 'Halte Kuningan Arah Utara' } },
        { type: 'node', id: 3, lat: -6.2, lon: 106.87, tags: { amenity: 'bus_station', network: 'Transjakarta', name: 'Flyover Jatinegara Arah Barat dan Timur' } },
      ],
    }
    expect(bacaTempat(jawaban, TEBET).map((t) => t.nama)).toEqual(['Stasiun Manggarai', 'Halte Kuningan', 'Halte Flyover Jatinegara'])
  })

  it('dengan jam ketemuan, tempat yang jelas tutup dilewati, sedangkan yang tanpa data atau tidak dikenali tetap ikut', () => {
    const jawaban = {
      elements: [kafe(1, 'Mo-Su 10:00-22:00'), kafe(2, '24/7'), kafe(3), kafe(4, 'sunrise-sunset'), kafe(5, 'Mo-Su,PH 10:00-22:00')],
    }
    // Jumat 23 Oktober 2026 pukul 23.00 WIB.
    const jamKetemuan = Date.parse('2026-10-23T23:00+07:00')
    expect(bacaTempat(jawaban, TEBET, { jamKetemuan }).map((t) => t.nama)).toEqual(['Kafe 2', 'Kafe 3', 'Kafe 4', 'Kafe 5'])
    expect(bacaTempat(jawaban, TEBET)).toHaveLength(5)
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

  it('halte yang dipecah per arah cukup jadi satu kandidat, yaitu peron yang terdekat', () => {
    const hasil = pilihKandidat(bacaTempat(JAWABAN_STASIUN, TEBET))
    expect(hasil.map((t) => [t.nama, t.osmId])).toEqual([
      ['Stasiun Tebet', 'node/3056674105'],
      ['Halte Stasiun Jatinegara', 'node/11744682976'],
      ['Halte Pancoran', 'node/6249633581'],
    ])
  })

  it('paling banyak empat stasiun yang ikut dihitung, supaya kafe dan resto tetap kebagian tempat', () => {
    const hasil = pilihKandidat([
      ...Array.from({ length: 6 }, (_, i) => tempatBuatan(`stasiun${i}`, `Stasiun ${i}`, 'stasiun', 50 + i)),
      ...Array.from({ length: 5 }, (_, i) => tempatBuatan(`kafe${i}`, `Kafe ${i}`, 'kafe', 300 + i)),
    ])
    expect(hasil.map((t) => t.osmId)).toEqual(['stasiun0', 'stasiun1', 'stasiun2', 'stasiun3', 'kafe0', 'kafe1', 'kafe2', 'kafe3', 'kafe4'])
  })

  it('urutan tetap sama walaupun jaraknya seri', () => {
    const seri = [tempatBuatan('b', 'B', 'kafe', 100), tempatBuatan('a', 'A', 'kafe', 100)]
    expect(pilihKandidat(seri).map((t) => t.osmId)).toEqual(['a', 'b'])
  })
})
