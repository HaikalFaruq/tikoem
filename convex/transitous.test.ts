import { describe, expect, it } from 'vitest'
import { PENGENAL } from './pengenal'
import { TransitousGagal, TransitousSibuk, durasiTransportasiUmum } from './transitous'

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
