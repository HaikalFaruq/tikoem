import { describe, expect, it } from 'vitest'
import { OverpassGagal, cariTempatSekitar } from './overpass'
import { kueriOverpass } from '../src/domain/tempat'

const TEBET = { lat: -6.226, lng: 106.858 }
const UTAMA = 'https://overpass-api.de/api/interpreter'
const CADANGAN = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'

/** `ke` adalah urutan panggilan, mulai dari 0. */
type Jawab = (server: string, kueri: string, ke: number) => Response | 'gantung'
type Panggilan = { server: string; kueri: string; init: RequestInit }

/** `fetch` tiruan. `'gantung'` berarti server tidak pernah menjawab sampai permintaannya dihentikan. */
function tiruanFetch(jawab: Jawab) {
  const panggilan: Panggilan[] = []
  const ambil = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const server = String(url)
    const kueri = new URLSearchParams(String(init.body)).get('data') ?? ''
    const hasil = jawab(server, kueri, panggilan.length)
    panggilan.push({ server, kueri, init })
    if (hasil !== 'gantung') return hasil
    return new Promise<Response>((_, gagal) => {
      init.signal?.addEventListener('abort', () => gagal(new DOMException('dihentikan', 'AbortError')))
    })
  }) as typeof fetch
  return { ambil, panggilan }
}

const kafe = (jumlah: number) => ({
  elements: Array.from({ length: jumlah }, (_, i) => ({
    type: 'node',
    id: i + 1,
    lat: TEBET.lat + i * 0.001,
    lon: TEBET.lng,
    tags: { amenity: i % 2 ? 'cafe' : 'restaurant', name: `Tempat ${i + 1}` },
  })),
})
const json = (isi: unknown, status = 200) => new Response(JSON.stringify(isi), { status })

describe('cariTempatSekitar', () => {
  it('memakai server utama dan tidak mengganggu server cadangan kalau jawabannya cepat', async () => {
    const { ambil, panggilan } = tiruanFetch(() => json(kafe(6)))
    const tempat = await cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 50 })

    expect(tempat.map((t) => t.nama)).toEqual(['Tempat 1', 'Tempat 2', 'Tempat 3', 'Tempat 4', 'Tempat 5', 'Tempat 6'])
    expect(panggilan).toHaveLength(1)
    expect(panggilan[0].server).toBe(UTAMA)
    // Fetch yang sudah selesai dibaca tidak boleh ikut dihentikan, karena runtime Convex melempar galat.
    expect(panggilan[0].init.signal?.aborted).toBe(false)
    expect(panggilan[0].init.method).toBe('POST')
    expect((panggilan[0].init.headers as Record<string, string>)['User-Agent']).toMatch(/^Tikoem\//)
    expect(panggilan[0].kueri).toBe(kueriOverpass(TEBET, 1000))
  })

  it('memakai server dari opsi kalau diisi, misalnya server tiruan untuk E2E', async () => {
    const { ambil, panggilan } = tiruanFetch(() => json(kafe(5)))
    await cariTempatSekitar(TEBET, 2000, { ambil, server: ['http://127.0.0.1:4319/overpass'] })
    expect(panggilan.map((p) => p.server)).toEqual(['http://127.0.0.1:4319/overpass'])
  })

  it('langsung pindah ke server cadangan kalau server utama menjawab galat', async () => {
    const { ambil, panggilan } = tiruanFetch((server) => (server === UTAMA ? json({}, 504) : json(kafe(5))))
    const mulai = Date.now()
    const tempat = await cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 10_000 })

    expect(tempat).toHaveLength(5)
    expect(panggilan.map((p) => p.server)).toEqual([UTAMA, CADANGAN])
    // Tidak menunggu jeda 10 detik, karena server utama sudah pasti gagal.
    expect(Date.now() - mulai).toBeLessThan(1000)
  })

  it('ikut bertanya ke server cadangan kalau server utama lama, lalu menghentikan server utama', async () => {
    const { ambil, panggilan } = tiruanFetch((server) => (server === UTAMA ? 'gantung' : json(kafe(5))))
    const tempat = await cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 30 })

    expect(tempat).toHaveLength(5)
    expect(panggilan[0].init.signal?.aborted).toBe(true)
    expect(panggilan[1].init.signal?.aborted).toBe(false)
  })

  it('menganggap remark berisi galat sebagai server gagal', async () => {
    const { ambil, panggilan } = tiruanFetch((server) =>
      server === UTAMA ? json({ elements: [], remark: 'runtime error: Query timed out' }) : json(kafe(5)),
    )
    expect(await cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 10_000 })).toHaveLength(5)
    expect(panggilan.map((p) => p.server)).toEqual([UTAMA, CADANGAN])
  })

  it('mencoba server utama sekali lagi kalau server cadangan juga gagal', async () => {
    const { ambil, panggilan } = tiruanFetch((_, __, ke) => (ke < 2 ? json({}, 504) : json(kafe(5))))
    expect(await cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 10_000 })).toHaveLength(5)
    expect(panggilan.map((p) => p.server)).toEqual([UTAMA, CADANGAN, UTAMA])
  })

  it('melempar OverpassGagal kalau semua percobaan gagal', async () => {
    const { ambil, panggilan } = tiruanFetch(() => json({}, 429))
    const hasil = cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 10 })
    await expect(hasil).rejects.toThrow(OverpassGagal)
    await expect(hasil).rejects.toThrow(/HTTP 429/)
    expect(panggilan).toHaveLength(3)
  })

  it('melempar OverpassGagal kalau tidak ada server yang menjawab sampai batas waktu', async () => {
    const { ambil, panggilan } = tiruanFetch(() => 'gantung')
    await expect(cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 10, batasMs: 100 })).rejects.toThrow(OverpassGagal)
    expect(panggilan.every((p) => p.init.signal?.aborted)).toBe(true)
  })

  it('memperluas radius sekali kalau tempatnya kurang dari lima', async () => {
    const { ambil, panggilan } = tiruanFetch((_, kueri) => json(kafe(kueri === kueriOverpass(TEBET, 1000) ? 2 : 7)))
    const tempat = await cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 10_000 })

    expect(tempat).toHaveLength(7)
    expect(panggilan.map((p) => p.kueri)).toEqual([kueriOverpass(TEBET, 1000), kueriOverpass(TEBET, 2500)])
  })

  it('mengembalikan daftar kosong kalau memang tidak ada tempat, supaya alur hitung bisa memberi TEMPAT_TIDAK_DITEMUKAN', async () => {
    const { ambil, panggilan } = tiruanFetch(() => json({ elements: [] }))
    expect(await cariTempatSekitar(TEBET, 2000, { ambil, jedaCadanganMs: 10_000 })).toEqual([])
    expect(panggilan).toHaveLength(2)
  })
})
