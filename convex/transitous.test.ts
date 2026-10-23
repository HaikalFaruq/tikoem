import { describe, expect, it } from 'vitest'
import { PENGENAL } from './pengenal'
import { TransitousGagal, TransitousSibuk, durasiTransportasiUmum, rencanaPerjalanan } from './transitous'

const KEMANG = { lat: -6.262, lng: 106.813 }
const KAFE = { lat: -6.2235, lng: 106.8559 }
const RESTO = { lat: -6.2257, lng: 106.8569 }
const MAL = { lat: -6.2244, lng: 106.8426 }
const URL_DASAR = 'http://127.0.0.1:4319/transitous'

type Panggilan = { url: string; init: RequestInit }

function tiruanFetch(jawab: () => Response | 'gantung') {
  const panggilan: Panggilan[] = []
  const ambil = (async (url: string | URL | Request, init: RequestInit = {}) => {
    panggilan.push({ url: String(url), init })
    const hasil = jawab()
    if (hasil !== 'gantung') return hasil
    return new Promise<Response>((_, gagal) => {
      init.signal?.addEventListener('abort', () => gagal(new DOMException('dihentikan', 'AbortError')))
    })
  }) as typeof fetch
  return { ambil, panggilan }
}

/** Galat dari Transitous yang menjawab 429 dengan header itu. */
async function sibuk(headers?: HeadersInit) {
  const ambil = tiruanFetch(() => new Response('', { status: 429, headers })).ambil
  const galat: unknown = await durasiTransportasiUmum(KEMANG, [KAFE], { urlDasar: URL_DASAR, ambil }).catch((e: unknown) => e)
  return galat as TransitousSibuk
}

describe('durasiTransportasiUmum', () => {
  it('meminta satu asal ke semua tujuan sekaligus, dengan batas 3 jam dan User-Agent Tikoem', async () => {
    const { ambil, panggilan } = tiruanFetch(() =>
      Response.json({ street_durations: [{}, {}], transit_durations: [[{ duration: 1500, transfers: 0 }], [{ duration: 1620, transfers: 1 }]] }),
    )
    await durasiTransportasiUmum(KEMANG, [KAFE, RESTO], { urlDasar: URL_DASAR, ambil })

    expect(panggilan).toHaveLength(1)
    const url = new URL(panggilan[0].url)
    expect(url.origin + url.pathname).toBe('http://127.0.0.1:4319/transitous/api/experimental/one-to-many-intermodal')
    expect(url.searchParams.get('one')).toBe('-6.262;106.813')
    expect(url.searchParams.get('many')).toBe('-6.2235;106.8559,-6.2257;106.8569')
    expect(url.searchParams.get('maxTravelTime')).toBe('180')
    // Tanpa jam berangkat, Transitous memakai jam sekarang.
    expect(url.searchParams.has('time')).toBe(false)
    expect(new Headers(panggilan[0].init.headers).get('User-Agent')).toBe(PENGENAL)
  })

  it('memakai server Transitous asli kalau urlDasar kosong, dengan jam berangkat yang diminta', async () => {
    const { ambil, panggilan } = tiruanFetch(() => Response.json({}))
    await durasiTransportasiUmum(KEMANG, [KAFE], { ambil, berangkat: Date.parse('2026-10-26T10:00+07:00') })

    const url = new URL(panggilan[0].url)
    expect(url.origin + url.pathname).toBe('https://api.transitous.org/api/experimental/one-to-many-intermodal')
    expect(url.searchParams.get('time')).toBe('2026-10-26T03:00:00.000Z')
  })

  it('menunggu antrean dulu, dan waktu menunggunya tidak memakan batas waktu permintaan', async () => {
    const urutan: string[] = []
    const { ambil } = tiruanFetch(() => {
      urutan.push('kirim')
      return Response.json({})
    })
    const antre = async () => {
      await new Promise((lanjut) => setTimeout(lanjut, 80))
      urutan.push('antre')
    }
    await durasiTransportasiUmum(KEMANG, [KAFE], { urlDasar: URL_DASAR, ambil, antre, batasMs: 50 })
    expect(urutan).toEqual(['antre', 'kirim'])
  })

  it('429 jadi TransitousSibuk, dengan jeda yang diminta lewat Retry-After', async () => {
    const detik = await sibuk({ 'Retry-After': '120' })
    expect(detik).toBeInstanceOf(TransitousSibuk)
    expect(detik).toBeInstanceOf(TransitousGagal)
    expect(detik.message).toContain('429')
    expect(detik.mintaJedaMs).toBe(120_000)

    // Tanggal HTTP hanya sampai detik, jadi jedanya bisa kurang sedikit dari 5 menit.
    const tanggal = await sibuk({ 'Retry-After': new Date(Date.now() + 300_000).toUTCString() })
    expect(tanggal.mintaJedaMs).toBeGreaterThan(298_000)
    expect(tanggal.mintaJedaMs).toBeLessThanOrEqual(300_000)

    expect((await sibuk()).mintaJedaMs).toBeUndefined()
    expect((await sibuk({ 'Retry-After': 'nanti saja' })).mintaJedaMs).toBeUndefined()
  })

  it('memakai yang tercepat antara jalan kaki langsung dan transportasi umum', async () => {
    const { ambil } = tiruanFetch(() =>
      Response.json({
        street_durations: [{ duration: 900 }, {}, { duration: 3000 }],
        transit_durations: [
          [{ duration: 1200, transfers: 0 }],
          [
            { duration: 1800, transfers: 0 },
            { duration: 1500, transfers: 1 },
          ],
          [{ duration: 2400, transfers: 1 }],
        ],
      }),
    )
    expect(await durasiTransportasiUmum(KEMANG, [KAFE, RESTO, MAL], { urlDasar: URL_DASAR, ambil })).toEqual([900, 1500, 2400])
  })

  it('tujuan tanpa rute, atau yang lebih dari 3 jam, jadi null', async () => {
    const { ambil } = tiruanFetch(() =>
      Response.json({
        street_durations: [{}, {}, {}],
        transit_durations: [[], [{ duration: 10_860, transfers: 2 }], [{ duration: 10_800, transfers: 2 }]],
      }),
    )
    expect(await durasiTransportasiUmum(KEMANG, [KAFE, RESTO, MAL], { urlDasar: URL_DASAR, ambil })).toEqual([null, null, 10_800])
  })

  it('jawaban kosong berarti tidak ada rute ke tempat mana pun', async () => {
    const { ambil } = tiruanFetch(() => Response.json({}))
    expect(await durasiTransportasiUmum(KEMANG, [KAFE, RESTO], { urlDasar: URL_DASAR, ambil })).toEqual([null, null])
  })

  it('meneruskan status HTTP tanpa membawa koordinat dari pesan Transitous', async () => {
    const { ambil } = tiruanFetch(() => Response.json({ error: 'could not match one=-6.262;106.813' }, { status: 422 }))
    const galat = await durasiTransportasiUmum(KEMANG, [KAFE], { urlDasar: URL_DASAR, ambil }).catch((e: unknown) => e)

    expect(galat).toBeInstanceOf(TransitousGagal)
    expect((galat as Error).message).toContain('422')
    expect((galat as Error).message).not.toMatch(/106|6\.26/)
  })

  it('menolak jawaban yang jumlahnya tidak sesuai jumlah tujuan', async () => {
    const { ambil } = tiruanFetch(() => Response.json({ street_durations: [{}], transit_durations: [[]] }))
    await expect(durasiTransportasiUmum(KEMANG, [KAFE, RESTO], { urlDasar: URL_DASAR, ambil })).rejects.toThrow(/tidak dikenali/)
  })

  it('menghentikan permintaan yang terlalu lama', async () => {
    const { ambil, panggilan } = tiruanFetch(() => 'gantung')
    await expect(durasiTransportasiUmum(KEMANG, [KAFE], { urlDasar: URL_DASAR, ambil, batasMs: 50 })).rejects.toThrow(TransitousGagal)
    expect(panggilan[0].init.signal?.aborted).toBe(true)
  })
})

/**
 * Potongan jawaban `/api/v6/plan` asli dari Depok Baru, dicek 23 Oktober 2026: satu pilihan KRL lalu TransJakarta, dan
 * jalan kaki langsung. Koordinat dan field lain yang tidak dibaca dibuang.
 */
const RENCANA = {
  from: { name: 'START' },
  to: { name: 'END' },
  direct: [
    {
      duration: 1500,
      startTime: '2026-10-26T11:00:00Z',
      endTime: '2026-10-26T11:25:00Z',
      transfers: 0,
      legs: [{ mode: 'WALK', startTime: '2026-10-26T11:00:00Z', endTime: '2026-10-26T11:25:00Z', from: { name: 'START' }, to: { name: 'END' } }],
    },
  ],
  itineraries: [
    {
      duration: 3660,
      startTime: '2026-10-26T11:10:00Z',
      endTime: '2026-10-26T12:11:00Z',
      transfers: 1,
      legs: [
        { mode: 'WALK', startTime: '2026-10-26T11:10:00Z', endTime: '2026-10-26T11:11:00Z', from: { name: 'START' }, to: { name: 'DEPOK BARU' } },
        {
          mode: 'REGIONAL_RAIL',
          startTime: '2026-10-26T11:11:00Z',
          endTime: '2026-10-26T11:48:00Z',
          from: { name: 'DEPOK BARU' },
          to: { name: 'GONDANGDIA' },
          headsign: 'JAKARTAKOTA',
          tripTo: { name: 'JAKARTA KOTA' },
          routeShortName: 'B',
          routeLongName: 'Commuter Line Bogor',
          agencyName: 'Kereta Commuter Indonesia',
          routeColor: 'e30a16',
          routeTextColor: 'ffffff',
          intermediateStops: [{ name: 'PONDOK CINA' }, { name: 'UNIV. INDONESIA' }, { name: 'CIKINI' }],
        },
        {
          mode: 'BUS',
          startTime: '2026-10-26T11:51:00Z',
          endTime: '2026-10-26T11:56:00Z',
          from: { name: 'Masjid Cut Nyak Dien' },
          to: { name: 'MH Thamrin 3' },
          headsign: 'Stasiun Gondangdia',
          routeShortName: '1H',
          routeLongName: 'Tanah Abang - Stasiun Gondangdia',
          agencyName: 'Transjakarta',
          routeColor: 'd65e62',
          routeTextColor: '000000',
        },
        { mode: 'WALK', startTime: '2026-10-26T11:56:00Z', endTime: '2026-10-26T12:11:00Z', from: { name: 'MH Thamrin 3' }, to: { name: 'END' } },
      ],
    },
  ],
}

const BUNDARAN_HI = { lat: -6.195, lng: 106.823 }
const kosong = { jalurPendek: null, jalurPanjang: null, arah: null, ujung: null, operator: null, perhentian: 0, warna: null, warnaTeks: null }

describe('rencanaPerjalanan', () => {
  it('meminta rencana dari satu titik ke satu tempat tanpa garis rute, dengan User-Agent Tikoem', async () => {
    const { ambil, panggilan } = tiruanFetch(() => Response.json({ itineraries: [] }))
    await rencanaPerjalanan(KEMANG, BUNDARAN_HI, { urlDasar: URL_DASAR, ambil, waktu: Date.parse('2026-10-26T19:00+07:00'), tiba: true })
    await rencanaPerjalanan(KEMANG, BUNDARAN_HI, { ambil, waktu: Date.parse('2026-10-26T18:00+07:00'), tiba: false })

    const [tiba, berangkat] = panggilan.map((p) => new URL(p.url))
    expect(tiba.origin + tiba.pathname).toBe('http://127.0.0.1:4319/transitous/api/v6/plan')
    expect(Object.fromEntries(tiba.searchParams)).toEqual({
      fromPlace: '-6.262,106.813',
      toPlace: '-6.195,106.823',
      time: '2026-10-26T12:00:00.000Z',
      arriveBy: 'true',
      detailedLegs: 'false',
    })
    expect(berangkat.origin + berangkat.pathname).toBe('https://api.transitous.org/api/v6/plan')
    expect(berangkat.searchParams.get('arriveBy')).toBe('false')
    expect(new Headers(panggilan[0].init.headers).get('User-Agent')).toBe(PENGENAL)
  })

  it('membaca pilihan transportasi umum dan jalan kaki langsung tanpa koordinat', async () => {
    const { ambil } = tiruanFetch(() => Response.json(RENCANA))
    const pilihan = await rencanaPerjalanan(KEMANG, BUNDARAN_HI, { urlDasar: URL_DASAR, ambil, waktu: Date.now(), tiba: false })

    expect(pilihan.map((p) => [p.pindah, p.bagian.map((b) => b.moda)])).toEqual([
      [1, ['WALK', 'REGIONAL_RAIL', 'BUS', 'WALK']],
      [0, ['WALK']],
    ])
    const [umum] = pilihan
    expect(umum.berangkat).toBe(Date.parse('2026-10-26T18:10+07:00'))
    expect(umum.sampai).toBe(Date.parse('2026-10-26T19:11+07:00'))
    expect(umum.bagian[0]).toEqual({ ...kosong, moda: 'WALK', mulai: umum.berangkat, selesai: Date.parse('2026-10-26T18:11+07:00'), dari: 'START', ke: 'DEPOK BARU' })
    expect(umum.bagian[1]).toMatchObject({
      dari: 'DEPOK BARU',
      ke: 'GONDANGDIA',
      jalurPendek: 'B',
      jalurPanjang: 'Commuter Line Bogor',
      arah: 'JAKARTAKOTA',
      ujung: 'JAKARTA KOTA',
      operator: 'Kereta Commuter Indonesia',
      perhentian: 3,
      warna: 'e30a16',
      warnaTeks: 'ffffff',
    })
    // Bus melingkar tidak punya tripTo di potongan ini, dan tidak ada perhentian di antaranya.
    expect(umum.bagian[2]).toMatchObject({ jalurPendek: '1H', arah: 'Stasiun Gondangdia', ujung: null, perhentian: 0 })
    expect(JSON.stringify(pilihan)).not.toMatch(/lat|lon|106\./)
  })

  it('jawaban tanpa pilihan berarti tidak ada rute', async () => {
    const { ambil } = tiruanFetch(() => Response.json({ direct: [], itineraries: [] }))
    expect(await rencanaPerjalanan(KEMANG, BUNDARAN_HI, { urlDasar: URL_DASAR, ambil, waktu: Date.now(), tiba: true })).toEqual([])
  })

  it('menolak jawaban yang bentuknya berubah', async () => {
    const tanpaMode = structuredClone(RENCANA)
    delete (tanpaMode.itineraries[0].legs[1] as { mode?: string }).mode
    const jamRusak = structuredClone(RENCANA)
    jamRusak.itineraries[0].startTime = 'kemarin'
    for (const isi of [{}, { itineraries: {} }, tanpaMode, jamRusak]) {
      const { ambil } = tiruanFetch(() => Response.json(isi))
      await expect(rencanaPerjalanan(KEMANG, BUNDARAN_HI, { urlDasar: URL_DASAR, ambil, waktu: Date.now(), tiba: false })).rejects.toThrow(
        /tidak dikenali/,
      )
    }
  })

  it('429 jadi TransitousSibuk, sama seperti waktu tempuh', async () => {
    const { ambil } = tiruanFetch(() => new Response('', { status: 429, headers: { 'Retry-After': '60' } }))
    const galat = await rencanaPerjalanan(KEMANG, BUNDARAN_HI, { urlDasar: URL_DASAR, ambil, waktu: Date.now(), tiba: false }).catch((e: unknown) => e)
    expect(galat).toBeInstanceOf(TransitousSibuk)
    expect((galat as TransitousSibuk).mintaJedaMs).toBe(60_000)
  })
})
