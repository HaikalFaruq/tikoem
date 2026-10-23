// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { hitungRingkasan } from './ringkasanRute'
import schema from './schema'

// Pola `!(*.*.*)` dari dokumentasi convex-test tidak didukung glob Vite 8, jadi pakai daftar pola dengan pengecualian.
const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts'])

const KEMANG = { lat: -6.262, lng: 106.813 }
const MANGGARAI = { lat: -6.2105, lng: 106.8505 }
const TEMPAT = { lat: -6.2141, lng: 106.8597 }
/** Rabu 21 Oktober 2026 (WIB). */
const jam = (hhmm: string, tanggal = '2026-10-21') => Date.parse(`${tanggal}T${hhmm}+07:00`)

/** Jawaban `/api/v6/plan`: jalan 5 menit, KRL 20 menit, jalan 3 menit, mulai dari `time` atau sampai tepat di `time`. */
function rencanaKrl(kueri: URLSearchParams) {
  const waktu = Date.parse(kueri.get('time')!)
  const awal = kueri.get('arriveBy') === 'true' ? waktu - 28 * 60_000 : waktu
  const t = (menit: number) => new Date(awal + menit * 60_000).toISOString()
  return {
    direct: [],
    itineraries: [
      {
        startTime: t(0),
        endTime: t(28),
        transfers: 0,
        legs: [
          { mode: 'WALK', startTime: t(0), endTime: t(5), from: { name: 'START' }, to: { name: 'MANGGARAI' } },
          {
            mode: 'REGIONAL_RAIL',
            startTime: t(5),
            endTime: t(25),
            from: { name: 'MANGGARAI' },
            to: { name: 'MATRAMAN' },
            tripTo: { name: 'CIKARANG' },
            routeLongName: 'Commuter Line Cikarang',
            agencyName: 'Kereta Commuter Indonesia',
            routeColor: '0084d8',
            routeTextColor: 'ffffff',
          },
          { mode: 'WALK', startTime: t(25), endTime: t(28), from: { name: 'MATRAMAN' }, to: { name: 'END' } },
        ],
      },
    ],
  }
}

/** `fetch` tiruan untuk Transitous `/api/v6/plan`. `jawab` boleh mengganti jawabannya, misalnya dengan 500 atau 429. */
function tiruanTransitous(jawab: (kueri: URLSearchParams) => Response | undefined = () => undefined) {
  const panggilan: URLSearchParams[] = []
  const ambil = vi.fn<typeof fetch>(async (url) => {
    const kueri = new URL(String(url)).searchParams
    panggilan.push(kueri)
    return jawab(kueri) ?? Response.json(rencanaKrl(kueri))
  })
  vi.stubGlobal('fetch', ambil)
  return panggilan
}

/** Haikal (motor) di Kemang dan Sari (transportasi umum) di Manggarai, hasilnya sudah keluar dengan satu tempat. */
async function roomSiap() {
  const t = convexTest(schema, modules)
  rateLimiter.register(t)
  const haikal = await t.mutation(api.room.buat, { nama: 'Haikal', kendaraan: 'motor' })
  const sari = await t.mutation(api.room.gabung, { kode: haikal.kode, nama: 'Sari', kendaraan: 'transportasi_umum' })
  await t.mutation(api.room.kirimLokasi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, lokasi: KEMANG })
  await t.mutation(api.room.kirimLokasi, { pesertaId: sari.pesertaId, kunci: sari.kunci, lokasi: MANGGARAI })
  const kandidatId = await t.run(async (ctx) => {
    const room = (await ctx.db.query('room').first())!
    await ctx.db.patch('room', room._id, { status: 'siap', hasilPada: Date.now(), versiHasil: room.versiLokasi })
    return await ctx.db.insert('kandidat', {
      roomId: room._id,
      osmId: 'node/1',
      nama: 'Stasiun Matraman',
      kategori: 'stasiun',
      lokasi: TEMPAT,
      jarakDariTengahMeter: 50,
      waktuTempuh: [],
      terlamaMenit: 20,
      selisihMenit: 3,
      peringkat: 1,
    })
  })
  const tetapkan = () => t.mutation(api.room.tetapkan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kandidatId })
  return { t, kode: haikal.kode, haikal, sari, tetapkan }
}

type Tes = Awaited<ReturnType<typeof roomSiap>>['t']

/** `rute` tiap orang dari `room.lihat`, menurut nama. */
async function rute(t: Tes, kode: string) {
  const hasil = await t.query(api.room.lihat, { kode })
  if (!hasil.ok) throw new Error(hasil.galat)
  return Object.fromEntries(hasil.peserta.map((p) => [p.nama, p.rute]))
}

/** Menjalankan ringkasan yang baru dijadwalkan, tanpa memajukan jam sampai batas waktu atau room berakhir. */
async function jalankanJadwal(t: Tes) {
  await vi.advanceTimersByTimeAsync(1)
  await t.finishInProgressScheduledFunctions()
}

describe('ringkasan rute (Discussions #83)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(jam('10:00'))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('setelah tempat ditetapkan, dihitung hanya untuk yang naik transportasi umum', async () => {
    const panggilan = tiruanTransitous()
    const { t, kode, tetapkan } = await roomSiap()
    expect(await rute(t, kode)).toEqual({ Haikal: null, Sari: null })

    await tetapkan()
    expect(await rute(t, kode)).toEqual({ Haikal: null, Sari: { status: 'menghitung' } })
    await jalankanJadwal(t)

    // Lokasi Sari sudah disamarkan, dan tanpa jam ketemuan rutenya berangkat sekarang.
    expect(panggilan.map((k) => Object.fromEntries(k))).toEqual([
      { fromPlace: '-6.21,106.851', toPlace: '-6.2141,106.8597', time: '2026-10-21T03:00:00.000Z', arriveBy: 'false', detailedLegs: 'false' },
    ])
    expect((await rute(t, kode)).Sari).toEqual({
      status: 'siap',
      jamKetemuan: null,
      dihitungPada: jam('10:00'),
      berangkat: jam('10:00'),
      sampai: jam('10:28'),
      langkah: [
        { jenis: 'jalan', mulai: jam('10:00'), menit: 5, ke: 'Stasiun Manggarai' },
        {
          jenis: 'kereta',
          layanan: 'KRL',
          jalur: 'Commuter Line Cikarang',
          arah: 'Cikarang',
          naik: 'Stasiun Manggarai',
          turun: 'Stasiun Matraman',
          mulai: jam('10:05'),
          menit: 20,
          perhentian: 0,
          warna: { latar: '#0084d8', teks: '#ffffff' },
        },
        { jenis: 'jalan', mulai: jam('10:25'), menit: 3, ke: null },
      ],
    })
  })

  it('dengan jam ketemuan, rutenya sampai paling lambat jam itu, dan jam yang berubah menghitung ulang', async () => {
    const panggilan = tiruanTransitous()
    const { t, kode, sari, tetapkan } = await roomSiap()
    await t.mutation(api.room.ubahJamKetemuan, { pesertaId: sari.pesertaId, kunci: sari.kunci, jamKetemuan: jam('19:00') })
    await tetapkan()
    await jalankanJadwal(t)
    expect((await rute(t, kode)).Sari).toMatchObject({ status: 'siap', jamKetemuan: jam('19:00'), berangkat: jam('18:32'), sampai: jam('19:00') })

    // Diubah dua kali sebelum sempat dihitung: hanya jam terakhir yang ditanyakan ke Transitous.
    await t.mutation(api.room.ubahJamKetemuan, { pesertaId: sari.pesertaId, kunci: sari.kunci, jamKetemuan: jam('19:30') })
    await t.mutation(api.room.ubahJamKetemuan, { pesertaId: sari.pesertaId, kunci: sari.kunci, jamKetemuan: jam('20:00') })
    expect((await rute(t, kode)).Sari).toEqual({ status: 'menghitung' })
    await jalankanJadwal(t)
    expect(panggilan.map((k) => [k.get('time'), k.get('arriveBy')])).toEqual([
      ['2026-10-21T12:00:00.000Z', 'true'],
      ['2026-10-21T13:00:00.000Z', 'true'],
    ])
    expect((await rute(t, kode)).Sari).toMatchObject({ status: 'siap', jamKetemuan: jam('20:00'), sampai: jam('20:00') })
  })

  it('di akhir pekan dihitung dengan jadwal Senin, lalu jamnya dikembalikan ke Sabtu', async () => {
    const panggilan = tiruanTransitous()
    const hasil = await hitungRingkasan(
      { asal: MANGGARAI, tujuan: TEMPAT, jamKetemuan: jam('19:00', '2026-10-24') },
      { urlTransitous: 'http://127.0.0.1:4319/transitous', sekarang: jam('10:00') },
    )
    expect(panggilan[0].get('time')).toBe('2026-10-26T12:00:00.000Z')
    expect(hasil).toMatchObject({ status: 'siap', berangkat: jam('18:32', '2026-10-24'), sampai: jam('19:00', '2026-10-24') })
  })

  it('selama tempat tetap, lokasi atau kendaraan yang berubah hanya menghitung ulang orang itu', async () => {
    const panggilan = tiruanTransitous()
    const { t, kode, haikal, sari, tetapkan } = await roomSiap()
    await tetapkan()
    await jalankanJadwal(t)
    expect(panggilan).toHaveLength(1)

    await t.mutation(api.room.kirimLokasi, { pesertaId: sari.pesertaId, kunci: sari.kunci, lokasi: { lat: -6.2, lng: 106.85 } })
    expect(await rute(t, kode)).toEqual({ Haikal: null, Sari: { status: 'menghitung' } })
    await jalankanJadwal(t)
    expect(panggilan.map((k) => k.get('fromPlace'))).toEqual(['-6.21,106.851', '-6.2,106.85'])

    // Haikal beralih ke transportasi umum, Sari beralih ke motor.
    await t.mutation(api.room.ubahKendaraan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kendaraan: 'transportasi_umum' })
    await t.mutation(api.room.ubahKendaraan, { pesertaId: sari.pesertaId, kunci: sari.kunci, kendaraan: 'motor' })
    await jalankanJadwal(t)
    expect(await rute(t, kode)).toMatchObject({ Haikal: { status: 'siap' }, Sari: null })
    expect(panggilan).toHaveLength(3)
  })

  it('dihapus saat tempat dibuka lagi, saat orangnya keluar, dan saat room berakhir', async () => {
    tiruanTransitous()
    const { t, kode, haikal, sari, tetapkan } = await roomSiap()
    await tetapkan()
    await jalankanJadwal(t)
    await t.mutation(api.room.bukaLagi, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    expect(await rute(t, kode)).toEqual({ Haikal: null, Sari: null })

    await tetapkan()
    await jalankanJadwal(t)
    await t.mutation(api.room.keluar, { pesertaId: sari.pesertaId, kunci: sari.kunci })
    expect(await t.run((ctx) => ctx.db.query('ringkasanRute').collect())).toEqual([])

    await t.mutation(api.room.ubahKendaraan, { pesertaId: haikal.pesertaId, kunci: haikal.kunci, kendaraan: 'transportasi_umum' })
    await jalankanJadwal(t)
    const roomId = await t.run(async (ctx) => (await ctx.db.query('room').first())!._id)
    await t.mutation(internal.room.tandaiKedaluwarsa, { roomId })
    expect(await t.run((ctx) => ctx.db.query('ringkasanRute').collect())).toEqual([])
  })

  it('Transitous yang gagal membuat ringkasan gagal tanpa mengubah room, dan Coba lagi hanya untuk ringkasan sendiri', async () => {
    let rusak = true
    const panggilan = tiruanTransitous(() => (rusak ? new Response('', { status: 500 }) : undefined))
    const { t, kode, haikal, sari, tetapkan } = await roomSiap()
    await tetapkan()
    await jalankanJadwal(t)
    expect((await rute(t, kode)).Sari).toEqual({ status: 'gagal' })
    const hasil = await t.query(api.room.lihat, { kode })
    expect(hasil).toMatchObject({ ok: true, room: { status: 'siap', tetap: { olehPesertaId: haikal.pesertaId } } })

    // Haikal tidak punya ringkasan, jadi tidak ada yang dicoba lagi.
    await t.mutation(api.room.hitungRute, { pesertaId: haikal.pesertaId, kunci: haikal.kunci })
    await jalankanJadwal(t)
    expect(panggilan).toHaveLength(1)

    rusak = false
    await t.mutation(api.room.hitungRute, { pesertaId: sari.pesertaId, kunci: sari.kunci })
    await jalankanJadwal(t)
    expect((await rute(t, kode)).Sari).toMatchObject({ status: 'siap' })

    // Ringkasan yang sudah siap tidak dihitung ulang lewat Coba lagi.
    await t.mutation(api.room.hitungRute, { pesertaId: sari.pesertaId, kunci: sari.kunci })
    await jalankanJadwal(t)
    expect(panggilan).toHaveLength(2)
  })

  it('tanpa pilihan dari Transitous, tidak ada rute di jam itu', async () => {
    tiruanTransitous(() => Response.json({ direct: [], itineraries: [] }))
    const { t, kode, sari, tetapkan } = await roomSiap()
    await t.mutation(api.room.ubahJamKetemuan, { pesertaId: sari.pesertaId, kunci: sari.kunci, jamKetemuan: jam('23:55') })
    await tetapkan()
    await jalankanJadwal(t)
    expect((await rute(t, kode)).Sari).toEqual({ status: 'tidak_ada', jamKetemuan: jam('23:55') })
  })

  it('429 dari Transitous mencatat jeda untuk seluruh app, dan selama jeda tidak ada yang ditanyakan', async () => {
    let sibuk = true
    const panggilan = tiruanTransitous(() => (sibuk ? new Response('', { status: 429 }) : undefined))
    const { t, kode, sari, tetapkan } = await roomSiap()
    await tetapkan()
    await jalankanJadwal(t)
    expect((await rute(t, kode)).Sari).toEqual({ status: 'gagal' })
    expect(await t.run((ctx) => ctx.db.query('jedaLayanan').collect())).toMatchObject([{ layanan: 'transitous' }])

    sibuk = false
    await t.mutation(api.room.hitungRute, { pesertaId: sari.pesertaId, kunci: sari.kunci })
    await jalankanJadwal(t)
    expect((await rute(t, kode)).Sari).toEqual({ status: 'gagal' })
    expect(panggilan).toHaveLength(1)
  })

  it('ringkasan yang tergantung jadi gagal setelah tiga menit, kecuali sudah dihitung ulang', async () => {
    tiruanTransitous()
    const { t, kode, sari, tetapkan } = await roomSiap()
    await tetapkan()
    const jadwal = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())
    expect(jadwal.find((j) => j.name.includes('batasWaktu'))?.scheduledTime).toBe(jam('10:03'))

    // Hitungnya tidak dijalankan, seperti action yang tergantung.
    const putaranPertama = await t.run(async (ctx) =>
      (await ctx.db.query('ringkasanRute').collect()).map((r) => ({ pesertaId: r.pesertaId, putaran: r.putaran })),
    )
    await t.mutation(api.room.ubahJamKetemuan, { pesertaId: sari.pesertaId, kunci: sari.kunci, jamKetemuan: jam('19:00') })
    // Batas waktu putaran yang sudah lewat tidak mengganggu putaran baru.
    await t.mutation(internal.ringkasanRute.batasWaktu, { target: putaranPertama })
    expect((await rute(t, kode)).Sari).toEqual({ status: 'menghitung' })

    const putaranKedua = putaranPertama.map((x) => ({ ...x, putaran: x.putaran + 1 }))
    await t.mutation(internal.ringkasanRute.batasWaktu, { target: putaranKedua })
    expect((await rute(t, kode)).Sari).toEqual({ status: 'gagal' })
  })
})
