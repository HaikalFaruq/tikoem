import { describe, expect, it } from 'vitest'
import { NominatimGagal, cariAlamat } from './nominatim'

const JAWABAN = [
  {
    lat: '-6.2232551',
    lon: '106.8426972',
    name: 'Kota Kasablanka',
    display_name: 'Kota Kasablanka, Kavling 88, Jalan Raya Casablanca, RW 05, Menteng Dalam, Tebet, Jakarta Selatan, 12870, Indonesia',
    address: { shop: 'Kota Kasablanka', village: 'Menteng Dalam', suburb: 'Tebet', city_district: 'Jakarta Selatan' },
  },
]

type Panggilan = { url: URL; init: RequestInit }

function tiruanFetch(jawab: () => Response | 'gantung' | Error) {
  const panggilan: Panggilan[] = []
  const ambil = (async (url: string | URL | Request, init: RequestInit = {}) => {
    panggilan.push({ url: new URL(String(url)), init })
    const hasil = jawab()
    if (hasil instanceof Error) throw hasil
    if (hasil !== 'gantung') return hasil
    return new Promise<Response>((_, gagal) => {
      init.signal?.addEventListener('abort', () => gagal(new DOMException('dihentikan', 'AbortError')))
    })
  }) as typeof fetch
  return { ambil, panggilan }
}

describe('cariAlamat', () => {
  it('mencari di Indonesia saja, dalam bahasa Indonesia, dan memperkenalkan diri', async () => {
    const { ambil, panggilan } = tiruanFetch(() => new Response(JSON.stringify(JAWABAN)))
    const hasil = await cariAlamat('  kota   kasablanka ', { ambil })

    expect(hasil).toEqual([
      { label: 'Kota Kasablanka, Menteng Dalam, Tebet, Jakarta Selatan', lokasi: { lat: -6.2232551, lng: 106.8426972 } },
    ])
    const { url, init } = panggilan[0]
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'kota kasablanka',
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'id',
      'accept-language': 'id',
    })
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^Tikoem\//)
  })

  it('memakai alamat dari opsi kalau diisi', async () => {
    const { ambil, panggilan } = tiruanFetch(() => new Response(JSON.stringify(JAWABAN)))
    await cariAlamat('Kota Kasablanka', { ambil, url: 'http://127.0.0.1:4319/nominatim/search' })
    expect(panggilan[0].url.origin + panggilan[0].url.pathname).toBe('http://127.0.0.1:4319/nominatim/search')
  })

  it('teks yang terlalu pendek tidak dikirim sama sekali', async () => {
    const { ambil, panggilan } = tiruanFetch(() => new Response('[]'))
    expect(await cariAlamat('ab', { ambil })).toEqual([])
    expect(panggilan).toHaveLength(0)
  })

  it('melempar NominatimGagal kalau Nominatim menolak, koneksi putus, atau terlalu lama', async () => {
    await expect(cariAlamat('Tebet', { ambil: tiruanFetch(() => new Response('', { status: 429 })).ambil })).rejects.toThrow(
      /HTTP 429/,
    )
    await expect(cariAlamat('Tebet', { ambil: tiruanFetch(() => new TypeError('fetch failed')).ambil })).rejects.toThrow(
      NominatimGagal,
    )
    const { ambil, panggilan } = tiruanFetch(() => 'gantung')
    await expect(cariAlamat('Tebet', { ambil, batasMs: 50 })).rejects.toThrow(NominatimGagal)
    expect(panggilan[0].init.signal?.aborted).toBe(true)
  })
})
