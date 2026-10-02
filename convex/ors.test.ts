import { describe, expect, it } from 'vitest'
import { KODE_TITIK_TIDAK_TERJANGKAU, OrsGagal, matriksDurasi } from './ors'

const KEMANG = { lat: -6.262, lng: 106.813 }
const TEBET = { lat: -6.226, lng: 106.858 }
const KAFE = { lat: -6.2235, lng: 106.8559 }
const RESTO = { lat: -6.2257, lng: 106.8569 }

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

describe('matriksDurasi', () => {
  it('mengirim peserta sebagai sumber dan tempat sebagai tujuan, dalam urutan [lng, lat]', async () => {
    const { ambil, panggilan } = tiruanFetch(() => Response.json({ durations: [[600, 720], [300, null]] }))
    const durasi = await matriksDurasi([KEMANG, TEBET], [KAFE, RESTO], 'driving-car', { kunci: 'kunci-uji', ambil })

    expect(durasi).toEqual([[600, 720], [300, null]])
    const { url, init } = panggilan[0]
    expect(url).toBe('https://api.openrouteservice.org/v2/matrix/driving-car')
    expect((init.headers as Record<string, string>).Authorization).toBe('kunci-uji')
    expect(JSON.parse(String(init.body))).toEqual({
      locations: [
        [106.813, -6.262],
        [106.858, -6.226],
        [106.8559, -6.2235],
        [106.8569, -6.2257],
      ],
      sources: [0, 1],
      destinations: [2, 3],
      metrics: ['duration'],
    })
  })

  it('meneruskan kode dan urutan titik yang ditolak, tanpa membawa koordinat dari pesan ORS', async () => {
    const pesanOrs = 'Could not find routable point within a radius of 350.0 meters of specified coordinate 3: 106.8569000 -6.2257000.'
    const { ambil } = tiruanFetch(() => Response.json({ error: { code: KODE_TITIK_TIDAK_TERJANGKAU, message: pesanOrs } }, { status: 404 }))
    const galat = await matriksDurasi([KEMANG, TEBET], [KAFE, RESTO], 'driving-car', { kunci: 'k', ambil }).catch((e: unknown) => e)

    expect(galat).toBeInstanceOf(OrsGagal)
    expect(galat).toMatchObject({ kode: KODE_TITIK_TIDAK_TERJANGKAU, indeksTitik: 3 })
    expect((galat as Error).message).not.toMatch(/106|6\.22/)
  })

  it('memakai alamat dasar dari opsi kalau diisi', async () => {
    const { ambil, panggilan } = tiruanFetch(() => Response.json({ durations: [[60]] }))
    await matriksDurasi([KEMANG], [KAFE], 'foot-walking', { kunci: 'k', ambil, urlDasar: 'http://127.0.0.1:4319/ors' })
    expect(panggilan[0].url).toBe('http://127.0.0.1:4319/ors/v2/matrix/foot-walking')
  })

  it('menolak jawaban yang bentuknya tidak sesuai jumlah titik', async () => {
    const { ambil } = tiruanFetch(() => Response.json({ durations: [[600]] }))
    await expect(matriksDurasi([KEMANG, TEBET], [KAFE], 'foot-walking', { kunci: 'k', ambil })).rejects.toThrow(/tidak dikenali/)
  })

  it('menghentikan permintaan yang terlalu lama', async () => {
    const { ambil, panggilan } = tiruanFetch(() => 'gantung')
    await expect(matriksDurasi([KEMANG], [KAFE], 'driving-car', { kunci: 'k', ambil, batasMs: 50 })).rejects.toThrow(OrsGagal)
    expect(panggilan[0].init.signal?.aborted).toBe(true)
  })
})
