// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { batasLaju } from './batasLaju'
import { hitungHasil, type PesertaDihitung } from './hitung'
import { OrsGagal } from './ors'
import schema from './schema'
import { TransitousGagal } from './transitous'

// Pola `!(*.*.*)` dari dokumentasi convex-test tidak didukung glob Vite 8, jadi pakai daftar pola dengan pengecualian.
const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts'])

const KEMANG = { lat: -6.262, lng: 106.813 }
const TEBET = { lat: -6.226, lng: 106.858 }
const GADING = { lat: -6.158, lng: 106.905 }

/** Enam tempat di sekitar titik tengah ketiga lokasi di atas. */
const TEMPAT = Array.from({ length: 6 }, (_, i) => ({
  type: 'node',
  id: i + 1,
  lat: -6.21 + i * 0.001,
  lon: 106.86,
  tags: { amenity: i % 2 ? 'cafe' : 'restaurant', name: `Tempat ${i + 1}`, ...(i === 0 ? { 'addr:street': 'Jalan Tebet Raya' } : {}) },
}))

type Skenario = {
  tempat?: unknown[]
  /** Detik dari sumber ke-i ke tujuan ke-j. `null` berarti tidak ada rute. */
  detik?: (i: number, j: number, profil: string) => number | null
  ors?: (jumlahSumber: number) => Response | undefined
  /** Detik transportasi umum dari `asal` ke tujuan ke-j lewat Transitous. `null` berarti tidak ada rute. */
  umum?: (asal: { lat: number; lng: number }, j: number) => number | null
}

/** `fetch` tiruan untuk Overpass, ORS, dan Transitous sekaligus. */
function tiruanFetch({ tempat = TEMPAT, detik = (i, j) => 600 + i * 300 + j * 60, ors, umum = (_, j) => 1500 + j * 60 }: Skenario = {}) {
  const panggilanOrs: { profil: string; tujuan: number }[] = []
  const panggilanUmum: { asal: string; tujuan: number }[] = []
  const ambil = vi.fn<typeof fetch>(async (url, init = {}) => {
    const alamat = String(url)
    if (alamat.includes('one-to-many-intermodal')) {
      const kueri = new URL(alamat).searchParams
      const asal = kueri.get('one')!
      const [lat, lng] = asal.split(';').map(Number)
      const tujuan = kueri.get('many')!.split(',')
      panggilanUmum.push({ asal, tujuan: tujuan.length })
      const detikUmum = tujuan.map((_, j) => umum({ lat, lng }, j))
      return Response.json({
        street_durations: tujuan.map(() => ({})),
        transit_durations: detikUmum.map((d) => (d === null ? [] : [{ duration: d, transfers: 1 }])),
      })
    }
    if (alamat.includes('openrouteservice')) {
      const profil = alamat.split('/').at(-1)!
      const isi = JSON.parse(String(init.body)) as { sources: number[]; destinations: number[] }
      panggilanOrs.push({ profil, tujuan: isi.destinations.length })
      const khusus = ors?.(isi.sources.length)
      if (khusus) return khusus
      return Response.json({ durations: isi.sources.map((i) => isi.destinations.map((_, j) => detik(i, j, profil))) })
    }
    return Response.json({ elements: tempat })
  })
  return { ambil, panggilanOrs, panggilanUmum }
}

const peserta = (id: string, kendaraan: PesertaDihitung['kendaraan'], lokasi: { lat: number; lng: number }): PesertaDihitung => ({
  id: id as Id<'peserta'>,
  kendaraan,
  lokasi,
})
const TIGA_ORANG = [peserta('haikal', 'motor', KEMANG), peserta('bintang', 'mobil', TEBET), peserta('umar', 'jalan_kaki', GADING)]

describe('hitungHasil', () => {
  it('memilih 5 kandidat paling adil dengan menit per orang yang dibulatkan ke atas', async () => {
    const { ambil, panggilanOrs } = tiruanFetch()
    const hasil = await hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil })
    if ('galat' in hasil) throw new Error(hasil.galat)

    // Satu permintaan untuk motor dan mobil (profil mobil), satu untuk jalan kaki.
    expect(panggilanOrs.map((p) => p.profil).toSorted()).toEqual(['driving-car', 'foot-walking'])
    expect(hasil.kandidat).toHaveLength(5)
    expect(hasil.kandidat.map((k) => k.peringkat)).toEqual([1, 2, 3, 4, 5])
    const [pertama] = hasil.kandidat
    expect(pertama).toMatchObject({ nama: 'Tempat 1', kategori: 'resto', alamat: 'Jl. Tebet Raya', terlamaMenit: 15, selisihMenit: 5 })
    expect(pertama.waktuTempuh).toEqual([
      { pesertaId: 'haikal', menit: 10 },
      { pesertaId: 'bintang', menit: 15 },
      { pesertaId: 'umar', menit: 10 },
    ])
    expect(hasil.kandidat.every((k, i, semua) => i === 0 || semua[i - 1].terlamaMenit <= k.terlamaMenit)).toBe(true)
  })

  it('membuang tempat yang tidak punya rute dari salah satu orang', async () => {
    const { ambil } = tiruanFetch({ detik: (_, j) => (j === 0 ? null : 600 + j * 60) })
    const hasil = await hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil })
    if ('galat' in hasil) throw new Error(hasil.galat)
    expect(hasil.kandidat.map((k) => k.nama)).not.toContain('Tempat 1')
  })

  it('membuang tempat yang ditolak ORS karena jauh dari jalan, lalu mencoba lagi', async () => {
    let ditolak = false
    const { ambil, panggilanOrs } = tiruanFetch({
      // Permintaan pertama menolak tujuan pertama: urutan titiknya sesudah semua sumber.
      ors: (jumlahSumber) => {
        if (ditolak) return undefined
        ditolak = true
        return Response.json({ error: { code: 6010, message: `Could not find routable point ... coordinate ${jumlahSumber}: 1 2.` } }, { status: 404 })
      },
    })
    const hasil = await hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil })
    if ('galat' in hasil) throw new Error(hasil.galat)
    expect(hasil.kandidat.map((k) => k.nama)).not.toContain('Tempat 1')
    expect(panggilanOrs.at(-1)?.tujuan).toBe(5)
  })

  it('TEMPAT_TIDAK_DITEMUKAN kalau tidak ada tempat di sekitar titik tengah', async () => {
    const { ambil } = tiruanFetch({ tempat: [] })
    expect(await hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil })).toEqual({ galat: 'TEMPAT_TIDAK_DITEMUKAN' })
  })

  it('LOKASI_TIDAK_TERJANGKAU dengan orangnya kalau ORS tidak menemukan jalan di dekat lokasi peserta', async () => {
    // Motor dan mobil satu permintaan (dua sumber). ORS 9 menjawab 200 dengan Bintang null di `sources`.
    const { ambil } = tiruanFetch({
      ors: (jumlahSumber) =>
        jumlahSumber === 2 ? Response.json({ durations: [Array(6).fill(600), Array(6).fill(null)], sources: [{}, null] }) : undefined,
    })
    expect(await hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil })).toEqual({
      galat: 'LOKASI_TIDAK_TERJANGKAU',
      pesertaTidakTerjangkau: 'bintang',
    })
  })

  it('LOKASI_TIDAK_TERJANGKAU juga kalau ORS menolak lokasi peserta dengan kode 6010', async () => {
    // Jalan kaki punya permintaan sendiri dengan satu sumber, jadi titik ke-0 di sana adalah Umar.
    const { ambil } = tiruanFetch({
      ors: (jumlahSumber) =>
        jumlahSumber === 1
          ? Response.json({ error: { code: 6010, message: 'Could not find routable point ... coordinate 0: 1 2.' } }, { status: 404 })
          : undefined,
    })
    expect(await hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil })).toEqual({
      galat: 'LOKASI_TIDAK_TERJANGKAU',
      pesertaTidakTerjangkau: 'umar',
    })
  })

  it('menunggu antrean sebelum tiap permintaan ORS, dan berhenti tanpa memanggil ORS kalau antrean penuh', async () => {
    const { ambil, panggilanOrs } = tiruanFetch()
    // Mencatat berapa permintaan ORS yang sudah terkirim saat antrean dipanggil.
    const giliran: number[] = []
    await hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil, antreOrs: async () => void giliran.push(panggilanOrs.length) })
    expect(giliran).toEqual([0, 1])
    expect(panggilanOrs).toHaveLength(2)

    const penuh = tiruanFetch()
    await expect(
      hitungHasil(TIGA_ORANG, { kunciOrs: 'k', ambil: penuh.ambil, antreOrs: () => Promise.reject(new OrsGagal('Antrean ORS penuh')) }),
    ).rejects.toThrow('Antrean ORS penuh')
    expect(penuh.panggilanOrs).toEqual([])
  })

  it('melempar OrsGagal kalau key ORS belum diisi, sebelum memanggil layanan apa pun', async () => {
    const { ambil } = tiruanFetch()
    await expect(hitungHasil(TIGA_ORANG, { kunciOrs: undefined, ambil })).rejects.toThrow(OrsGagal)
    expect(ambil).not.toHaveBeenCalled()
  })
})

describe('hitungHasil dengan transportasi umum (Discussions #63)', () => {
  const URL_TRANSITOUS = 'http://127.0.0.1:4319/transitous'
  /** Haikal naik motor, Bintang dan Umar naik transportasi umum. */
  const ORANG_CAMPUR = [
    peserta('haikal', 'motor', KEMANG),
    peserta('bintang', 'transportasi_umum', TEBET),
    peserta('umar', 'transportasi_umum', GADING),
  ]
  /** Dari Tebet 25 menit dan dari Kelapa Gading 40 menit ke tempat pertama, lalu tiap tempat berikutnya 1 menit lebih jauh. */
  const umumDariAsal = (asal: { lat: number }, j: number) => (asal.lat === TEBET.lat ? 1500 : 2400) + j * 60

  it('orang yang naik transportasi umum dihitung lewat Transitous, satu permintaan per orang, sisanya lewat ORS', async () => {
    const { ambil, panggilanOrs, panggilanUmum } = tiruanFetch({ umum: umumDariAsal })
    const hasil = await hitungHasil(ORANG_CAMPUR, { kunciOrs: 'k', ambil, urlTransitous: URL_TRANSITOUS })
    if ('galat' in hasil) throw new Error(hasil.galat)

    expect(panggilanUmum.map((p) => p.asal).toSorted()).toEqual(['-6.158;106.905', '-6.226;106.858'])
    expect(panggilanUmum.every((p) => p.tujuan === 6)).toBe(true)
    expect(panggilanOrs).toEqual([{ profil: 'driving-car', tujuan: 6 }])
    expect(hasil.kandidat.find((k) => k.nama === 'Tempat 1')?.waktuTempuh).toEqual([
      { pesertaId: 'haikal', menit: 10 },
      { pesertaId: 'bintang', menit: 25 },
      { pesertaId: 'umar', menit: 40 },
    ])
  })

  it('TRANSPORTASI_UMUM_TIDAK_TERJANGKAU dengan orangnya kalau Transitous tidak menemukan rute ke tempat mana pun', async () => {
    const { ambil } = tiruanFetch({ umum: (asal, j) => (asal.lat === GADING.lat ? null : umumDariAsal(asal, j)) })
    expect(await hitungHasil(ORANG_CAMPUR, { kunciOrs: 'k', ambil, urlTransitous: URL_TRANSITOUS })).toEqual({
      galat: 'TRANSPORTASI_UMUM_TIDAK_TERJANGKAU',
      pesertaTidakTerjangkau: 'umar',
    })
  })

  it('membuang tempat yang tidak punya rute transportasi umum', async () => {
    const { ambil } = tiruanFetch({ umum: (asal, j) => (j === 0 ? null : umumDariAsal(asal, j)) })
    const hasil = await hitungHasil(ORANG_CAMPUR, { kunciOrs: 'k', ambil, urlTransitous: URL_TRANSITOUS })
    if ('galat' in hasil) throw new Error(hasil.galat)
    expect(hasil.kandidat.map((k) => k.nama)).toEqual(['Tempat 2', 'Tempat 3', 'Tempat 4', 'Tempat 5', 'Tempat 6'])
  })

  it('waktu transportasi umum tetap cocok dengan tempatnya setelah ORS membuang tempat yang jauh dari jalan', async () => {
    let ditolak = false
    const { ambil } = tiruanFetch({
      umum: umumDariAsal,
      // Permintaan ORS pertama menolak tempat pertama: urutan titiknya sesudah semua sumber.
      ors: (jumlahSumber) => {
        if (ditolak) return undefined
        ditolak = true
        return Response.json({ error: { code: 6010, message: `Could not find routable point ... coordinate ${jumlahSumber}: 1 2.` } }, { status: 404 })
      },
    })
    const hasil = await hitungHasil(ORANG_CAMPUR, { kunciOrs: 'k', ambil, urlTransitous: URL_TRANSITOUS })
    if ('galat' in hasil) throw new Error(hasil.galat)

    // Tempat ke-n berjarak 25 + (n - 1) menit dari Tebet.
    expect(hasil.kandidat.map((k) => [k.nama, k.waktuTempuh.find((w) => w.pesertaId === 'bintang')?.menit])).toEqual([
      ['Tempat 2', 26],
      ['Tempat 3', 27],
      ['Tempat 4', 28],
      ['Tempat 5', 29],
      ['Tempat 6', 30],
    ])
  })

  it('TEMPAT_TIDAK_DITEMUKAN tanpa bertanya ke Transitous kalau tidak ada tempat di sekitar titik tengah', async () => {
    const { ambil, panggilanUmum } = tiruanFetch({ tempat: [] })
    expect(await hitungHasil(ORANG_CAMPUR, { kunciOrs: 'k', ambil, urlTransitous: URL_TRANSITOUS })).toEqual({
      galat: 'TEMPAT_TIDAK_DITEMUKAN',
    })
    expect(panggilanUmum).toEqual([])
  })

  it('melempar TransitousGagal kalau Transitous belum disambungkan, sebelum memanggil layanan apa pun', async () => {
    const { ambil } = tiruanFetch()
    await expect(hitungHasil(ORANG_CAMPUR, { kunciOrs: 'k', ambil })).rejects.toThrow(TransitousGagal)
    expect(ambil).not.toHaveBeenCalled()
  })

  it('room yang semuanya naik transportasi umum tidak memanggil ORS dan tidak butuh key-nya', async () => {
    const { ambil, panggilanOrs, panggilanUmum } = tiruanFetch({ umum: umumDariAsal })
    const semuaUmum = ORANG_CAMPUR.slice(1)
    const hasil = await hitungHasil(semuaUmum, { kunciOrs: undefined, ambil, urlTransitous: URL_TRANSITOUS })
    if ('galat' in hasil) throw new Error(hasil.galat)
    expect(hasil.kandidat).toHaveLength(5)
    expect(panggilanOrs).toEqual([])
    expect(panggilanUmum).toHaveLength(2)
  })
})

/** Room berisi Haikal (motor), Bintang (mobil), dan Umar (jalan kaki) yang semuanya sudah berbagi lokasi. */
async function roomTigaOrang() {
  const t = convexTest(schema, modules)
  rateLimiter.register(t)
  const haikal = await t.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const bintang = await t.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Bintang', kendaraan: 'mobil' })
  const umar = await t.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Umar', kendaraan: 'jalan_kaki' })
  for (const [p, lokasi] of [
    [haikal, KEMANG],
    [bintang, TEBET],
    [umar, GADING],
  ] as const) {
    await t.mutation(api.room.kirimLokasi, { pesertaId: p.pesertaId, kunci: p.kunci, lokasi })
  }
  const roomId = await t.run(async (ctx) => (await ctx.db.query('room').first())!._id)
  return { t, kode: haikal.kode, roomId, haikal, umar }
}

/** ORS 9 tidak menemukan jalan di dekat lokasi Umar, yang punya permintaan jalan kaki sendiri. */
const umarDiLaut = () =>
  tiruanFetch({ ors: (jumlahSumber) => (jumlahSumber === 1 ? Response.json({ durations: [Array(6).fill(null)], sources: [null] }) : undefined) })

async function lihat(t: ReturnType<typeof convexTest>, kode: string) {
  const hasil = await t.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return hasil
}

describe('alur hitung di Convex', () => {
  beforeEach(() => {
    // Fungsi terjadwal hanya jalan kalau dipanggil di test, bukan otomatis di latar.
    vi.useFakeTimers()
    vi.stubEnv('ORS_API_KEY', 'kunci-uji')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('tombol Cari tempat sampai hasil keluar, lalu jadi usang kalau ada lokasi yang berubah', async () => {
    vi.stubGlobal('fetch', tiruanFetch().ambil)
    const { t, kode, roomId, haikal, umar } = await roomTigaOrang()

    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    expect((await lihat(t, kode)).room.status).toBe('menghitung')

    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    const hasil = await lihat(t, kode)
    expect(hasil.room).toMatchObject({ status: 'siap', galatHitung: null, hasilUsang: false })
    expect(hasil.room.hasilPada).toEqual(expect.any(Number))
    expect(hasil.room.titikTengah).not.toBeNull()
    expect(hasil.kandidat.map((k) => k.peringkat)).toEqual([1, 2, 3, 4, 5])
    expect(hasil.kandidat[0].waktuTempuh.map((w) => w.pesertaId)).toEqual(hasil.peserta.map((p) => p.id))

    await t.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: { lat: -6.17, lng: 106.9 } })
    expect((await lihat(t, kode)).room.hasilUsang).toBe(true)
  })

  it('hitung ulang mengganti kandidat sekaligus dan mengosongkan vote', async () => {
    vi.stubGlobal('fetch', tiruanFetch().ambil)
    const { t, kode, roomId, haikal, umar } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    const kandidatLama = (await lihat(t, kode)).kandidat
    await t.run(async (ctx) => {
      await ctx.db.insert('vote', { roomId, pesertaId: haikal.pesertaId, kandidatId: kandidatLama[0].id })
    })

    // Hitung ulang baru jalan setelah ada lokasi yang berubah.
    await t.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: { lat: -6.17, lng: 106.9 } })
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    // Selama hitung ulang, kandidat lama tetap dikirim supaya layar tidak berkedip kosong.
    expect((await lihat(t, kode)).kandidat.map((k) => k.id)).toEqual(kandidatLama.map((k) => k.id))

    await t.action(internal.hitung.jalankan, { roomId, putaran: 2 })
    const baru = await lihat(t, kode)
    expect(baru.kandidat).toHaveLength(5)
    expect(baru.kandidat.map((k) => k.id)).not.toEqual(kandidatLama.map((k) => k.id))
    expect(await t.run((ctx) => ctx.db.query('vote').collect())).toEqual([])
  })

  it('hasil yang masih berlaku tidak dihitung ulang, jadi kuota ORS tidak terpakai dan vote tetap ada', async () => {
    const tiruan = tiruanFetch()
    vi.stubGlobal('fetch', tiruan.ambil)
    const { t, kode, roomId, haikal } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    const sebelum = await lihat(t, kode)
    await t.mutation(api.room.vote, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId: sebelum.kandidat[0].id })
    const permintaanOrs = tiruan.panggilanOrs.length

    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    const sesudah = await lihat(t, kode)
    expect(sesudah.room).toMatchObject({ status: 'siap', hasilUsang: false, hasilPada: sebelum.room.hasilPada })
    expect(sesudah.kandidat.map((k) => k.id)).toEqual(sebelum.kandidat.map((k) => k.id))
    expect(sesudah.kandidat[0].pemilih).toEqual([haikal.pesertaId])
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(tiruan.panggilanOrs).toHaveLength(permintaanOrs)
  })

  it('permintaan ORS antre kalau jatah per menit sudah habis', async () => {
    const tiruan = tiruanFetch()
    vi.stubGlobal('fetch', tiruan.ambil)
    const { t, kode, haikal } = await roomTigaOrang()
    await t.run((ctx) => batasLaju.limit(ctx, 'ors', { count: 10 }))
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })

    // `jalankan` yang dijadwalkan `room.hitung` mulai begitu jam dimajukan. 30 per menit berarti satu jatah tiap 2 detik,
    // dan room ini butuh dua permintaan: profil mobil dan jalan kaki.
    await vi.advanceTimersByTimeAsync(1900)
    expect(tiruan.panggilanOrs).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(tiruan.panggilanOrs).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    await t.finishInProgressScheduledFunctions()
    expect(tiruan.panggilanOrs).toHaveLength(2)
    expect((await lihat(t, kode)).room.status).toBe('siap')
  })

  it('LAYANAN_GAGAL tanpa memanggil ORS kalau antreannya penuh', async () => {
    const tiruan = tiruanFetch()
    vi.stubGlobal('fetch', tiruan.ambil)
    const { t, kode, roomId, haikal } = await roomTigaOrang()
    // Isi 10 terpakai dan lima antrean terisi.
    await t.run((ctx) => batasLaju.limit(ctx, 'ors', { count: 15, reserve: true }))
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })

    expect((await lihat(t, kode)).room).toMatchObject({ status: 'gagal', galatHitung: 'LAYANAN_GAGAL' })
    expect(tiruan.panggilanOrs).toEqual([])
  })

  it('server ORS lain yang diisi lewat ORS_URL tidak memakai antrean', async () => {
    vi.stubEnv('ORS_URL', 'http://127.0.0.1:4319/openrouteservice')
    const tiruan = tiruanFetch()
    vi.stubGlobal('fetch', tiruan.ambil)
    const { t, kode, roomId, haikal } = await roomTigaOrang()
    await t.run((ctx) => batasLaju.limit(ctx, 'ors', { count: 15, reserve: true }))
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })

    expect((await lihat(t, kode)).room.status).toBe('siap')
    expect(tiruan.panggilanOrs).toHaveLength(2)
  })

  it('LAYANAN_GAGAL kalau ORS gagal, dan room bisa dicoba lagi', async () => {
    vi.stubGlobal('fetch', tiruanFetch({ ors: () => new Response('', { status: 503 }) }).ambil)
    const { t, kode, roomId, haikal } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })

    expect((await lihat(t, kode)).room).toMatchObject({ status: 'gagal', galatHitung: 'LAYANAN_GAGAL' })
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    expect((await lihat(t, kode)).room).toMatchObject({ status: 'menghitung', galatHitung: null })
  })

  it('TEMPAT_TIDAK_DITEMUKAN kalau Overpass tidak menemukan tempat', async () => {
    vi.stubGlobal('fetch', tiruanFetch({ tempat: [] }).ambil)
    const { t, kode, roomId, haikal } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    expect((await lihat(t, kode)).room).toMatchObject({ status: 'gagal', galatHitung: 'TEMPAT_TIDAK_DITEMUKAN', pesertaTidakTerjangkau: null })
  })

  it('LOKASI_TIDAK_TERJANGKAU menyebut orangnya, lalu dikosongkan saat dicari lagi', async () => {
    vi.stubGlobal('fetch', umarDiLaut().ambil)
    const { t, kode, roomId, haikal, umar } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    expect((await lihat(t, kode)).room).toMatchObject({
      status: 'gagal',
      galatHitung: 'LOKASI_TIDAK_TERJANGKAU',
      pesertaTidakTerjangkau: umar.pesertaId,
    })

    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    expect((await lihat(t, kode)).room).toMatchObject({ status: 'menghitung', galatHitung: null, pesertaTidakTerjangkau: null })
  })

  it('pesertaTidakTerjangkau jadi null kalau orangnya sudah keluar room', async () => {
    vi.stubGlobal('fetch', umarDiLaut().ambil)
    const { t, kode, roomId, haikal, umar } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    await t.mutation(api.room.keluar, { pesertaId: umar.pesertaId, kunci: umar.kunci })
    expect((await lihat(t, kode)).room).toMatchObject({ galatHitung: 'LOKASI_TIDAK_TERJANGKAU', pesertaTidakTerjangkau: null })
  })

  it('pesertaTidakTerjangkau dikosongkan saat orang itu mengirim lokasi baru, tidak saat orang lain', async () => {
    vi.stubGlobal('fetch', umarDiLaut().ambil)
    const { t, kode, roomId, haikal, umar } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })

    await t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: TEBET })
    expect((await lihat(t, kode)).room).toMatchObject({ pesertaTidakTerjangkau: umar.pesertaId })

    await t.mutation(api.room.kirimLokasi, { pesertaId: umar.pesertaId, kunci: umar.kunci, lokasi: TEBET })
    // Galatnya tetap sampai dicari lagi, tapi Umar tidak lagi disebut.
    expect((await lihat(t, kode)).room).toMatchObject({ status: 'gagal', galatHitung: 'LOKASI_TIDAK_TERJANGKAU', pesertaTidakTerjangkau: null })
  })

  it('transportasi umum dihitung lewat TRANSITOUS_URL, dan tanpa env itu hitung berakhir LAYANAN_GAGAL', async () => {
    const tiruan = tiruanFetch()
    vi.stubGlobal('fetch', tiruan.ambil)
    const { t, kode, roomId, haikal, umar } = await roomTigaOrang()
    await t.mutation(api.room.ubahKendaraan, { pesertaId: umar.pesertaId, kunci: umar.kunci, kendaraan: 'transportasi_umum' })
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    expect((await lihat(t, kode)).room).toMatchObject({ status: 'gagal', galatHitung: 'LAYANAN_GAGAL' })
    expect(tiruan.panggilanUmum).toEqual([])

    vi.stubEnv('TRANSITOUS_URL', 'http://127.0.0.1:4319/transitous')
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 2 })
    expect((await lihat(t, kode)).room.status).toBe('siap')
    expect(tiruan.panggilanUmum.map((p) => p.asal)).toEqual(['-6.158;106.905'])
  })

  it('TRANSPORTASI_UMUM_TIDAK_TERJANGKAU menyebut orang yang tidak punya rute transportasi umum', async () => {
    vi.stubEnv('TRANSITOUS_URL', 'http://127.0.0.1:4319/transitous')
    vi.stubGlobal('fetch', tiruanFetch({ umum: () => null }).ambil)
    const { t, kode, roomId, haikal, umar } = await roomTigaOrang()
    await t.mutation(api.room.ubahKendaraan, { pesertaId: umar.pesertaId, kunci: umar.kunci, kendaraan: 'transportasi_umum' })
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    expect((await lihat(t, kode)).room).toMatchObject({
      status: 'gagal',
      galatHitung: 'TRANSPORTASI_UMUM_TIDAK_TERJANGKAU',
      pesertaTidakTerjangkau: umar.pesertaId,
    })
  })

  it('batas waktu menggagalkan hitung yang tergantung, dan hasil dari putaran lama diabaikan', async () => {
    vi.stubGlobal('fetch', tiruanFetch().ambil)
    const { t, kode, roomId, haikal } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })

    await t.mutation(internal.hitung.batasWaktu, { roomId, putaran: 1 })
    expect((await lihat(t, kode)).room).toMatchObject({ status: 'gagal', galatHitung: 'LAYANAN_GAGAL' })

    // Action putaran 1 yang baru selesai sesudahnya tidak boleh menimpa status.
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    expect((await lihat(t, kode)).kandidat).toEqual([])

    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.mutation(internal.hitung.batasWaktu, { roomId, putaran: 1 })
    expect((await lihat(t, kode)).room.status).toBe('menghitung')
  })

  it('hasil yang datang terlambat tidak menimpa batas waktu atau putaran yang lebih baru', async () => {
    const { t, kode, roomId, haikal } = await roomTigaOrang()
    const hasilTerlambat = {
      roomId,
      putaran: 1,
      versiLokasi: 3,
      titikTengah: TEBET,
      kandidat: [
        {
          osmId: 'node/1',
          nama: 'Terlambat',
          kategori: 'kafe' as const,
          lokasi: TEBET,
          jarakDariTengahMeter: 10,
          waktuTempuh: [{ pesertaId: haikal.pesertaId, menit: 5 }],
          terlamaMenit: 5,
          selisihMenit: 0,
          peringkat: 1,
        },
      ],
    }

    // Action putaran 1 sudah lewat `bahan`, tapi batas waktunya keburu jalan.
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.mutation(internal.hitung.batasWaktu, { roomId, putaran: 1 })
    await t.mutation(internal.hitung.simpan, hasilTerlambat)
    expect((await lihat(t, kode)).room.status).toBe('gagal')
    expect((await lihat(t, kode)).kandidat).toEqual([])

    // Tombol ditekan lagi (putaran 2), lalu hasil putaran 1 baru datang.
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.mutation(internal.hitung.simpan, hasilTerlambat)
    expect((await lihat(t, kode)).room.status).toBe('menghitung')
    expect((await lihat(t, kode)).kandidat).toEqual([])
  })

  it('hasil yang datang setelah room berakhir tidak menulis ulang data yang sudah dihapus', async () => {
    vi.stubGlobal('fetch', tiruanFetch().ambil)
    const { t, roomId, haikal } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await t.mutation(internal.room.tandaiKedaluwarsa, { roomId })

    // Action yang dimulai sebelum room berakhir berhenti di `bahan`.
    await t.action(internal.hitung.jalankan, { roomId, putaran: 1 })
    // Action yang sudah lewat `bahan` sebelum room berakhir ditolak di `simpan`.
    await t.mutation(internal.hitung.simpan, {
      roomId,
      putaran: 1,
      versiLokasi: 3,
      titikTengah: TEBET,
      kandidat: [
        {
          osmId: 'node/1',
          nama: 'Terlambat',
          kategori: 'kafe',
          lokasi: TEBET,
          jarakDariTengahMeter: 10,
          waktuTempuh: [],
          terlamaMenit: 5,
          selisihMenit: 0,
          peringkat: 1,
        },
      ],
    })
    expect(await t.run((ctx) => ctx.db.query('kandidat').collect())).toEqual([])
  })

  it('menolak tombol Cari tempat yang ditekan lagi saat masih menghitung', async () => {
    const { t, haikal } = await roomTigaOrang()
    await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    const galat = await t.mutation(api.room.hitung, { pesertaId: haikal.pesertaId, kunci: haikal.kunci }).catch((e: unknown) => e)
    expect((galat as ConvexError<{ galat: string }>).data.galat).toBe('SEDANG_MENGHITUNG')
  })
})
