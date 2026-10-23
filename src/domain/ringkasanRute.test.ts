import { describe, expect, it } from 'vitest'
import { ringkasRute, type BagianPerjalanan, type PilihanPerjalanan } from './ringkasanRute'

const HARI = 24 * 60 * 60_000
/** Jam pada Senin 26 Oktober 2026 (WIB). */
const jam = (hhmm: string) => Date.parse(`2026-10-26T${hhmm}+07:00`)

const kosong = { jalurPendek: null, jalurPanjang: null, arah: null, ujung: null, operator: null, perhentian: 0, warna: null, warnaTeks: null }
const jalan = (dari: string, ke: string, mulai: string, selesai: string): BagianPerjalanan => ({
  ...kosong,
  moda: 'WALK',
  mulai: jam(mulai),
  selesai: jam(selesai),
  dari,
  ke,
})
/** KRL jalur Bogor ke arah Jakarta Kota, seperti di feed open-krl. */
const krl = (dari: string, ke: string, mulai: string, selesai: string, lain: Partial<BagianPerjalanan> = {}): BagianPerjalanan => ({
  moda: 'REGIONAL_RAIL',
  mulai: jam(mulai),
  selesai: jam(selesai),
  dari,
  ke,
  jalurPendek: 'B',
  jalurPanjang: 'Commuter Line Bogor',
  arah: 'JAKARTAKOTA',
  ujung: 'JAKARTA KOTA',
  operator: 'Kereta Commuter Indonesia',
  perhentian: 8,
  warna: 'e30a16',
  warnaTeks: 'ffffff',
  ...lain,
})
/** TransJakarta koridor 1 Blok M–Kota, seperti di feed TransJakarta. */
const tj = (dari: string, ke: string, mulai: string, selesai: string, lain: Partial<BagianPerjalanan> = {}): BagianPerjalanan => ({
  moda: 'BUS',
  mulai: jam(mulai),
  selesai: jam(selesai),
  dari,
  ke,
  jalurPendek: '1',
  jalurPanjang: 'Blok M - Kota',
  arah: 'Kota',
  ujung: 'Kali Besar',
  operator: 'Transjakarta',
  perhentian: 17,
  warna: 'd62126',
  warnaTeks: 'ffffff',
  ...lain,
})
const pilihan = (pindah: number, ...bagian: BagianPerjalanan[]): PilihanPerjalanan => ({
  berangkat: bagian[0].mulai,
  sampai: bagian.at(-1)!.selesai,
  pindah,
  bagian,
})

const opsi = { dihitungPada: jam('10:00'), geserMs: 0 }

/** Tiga pilihan dari Transitous untuk Blok M ke Kota Tua, sampai paling lambat Senin 19.00 (dicek 23 Oktober 2026). */
const BLOK_M_KE_KOTA = [
  pilihan(
    1,
    jalan('START', 'Kejaksaan Agung', '17:29', '17:40'),
    tj('Kejaksaan Agung', 'Cikoko Arah Timur', '17:40', '18:12', { jalurPendek: '4K', arah: 'Pulo Gadung' }),
    jalan('Cikoko Arah Timur', 'CAWANG', '18:12', '18:15'),
    krl('CAWANG', 'JAKARTA KOTA', '18:15', '18:44'),
    jalan('JAKARTA KOTA', 'END', '18:44', '18:52'),
  ),
  pilihan(0, jalan('START', 'ASEAN', '17:34', '17:45'), tj('ASEAN', 'Kali Besar', '17:45', '18:50'), jalan('Kali Besar', 'END', '18:50', '18:54')),
  pilihan(0, jalan('START', 'ASEAN', '17:40', '17:51'), tj('ASEAN', 'Kali Besar', '17:51', '18:56'), jalan('Kali Besar', 'END', '18:56', '19:00')),
]

describe('ringkasRute', () => {
  it('dengan jam ketemuan, mengambil pilihan yang berangkat paling akhir', () => {
    expect(ringkasRute(BLOK_M_KE_KOTA, { ...opsi, jamKetemuan: jam('19:00') })).toEqual({
      status: 'siap',
      jamKetemuan: jam('19:00'),
      dihitungPada: jam('10:00'),
      berangkat: jam('17:40'),
      sampai: jam('19:00'),
      langkah: [
        { jenis: 'jalan', mulai: jam('17:40'), menit: 11, ke: 'Halte ASEAN' },
        {
          jenis: 'bus',
          layanan: 'TransJakarta',
          jalur: '1',
          arah: 'Kota',
          naik: 'Halte ASEAN',
          turun: 'Halte Kali Besar',
          mulai: jam('17:51'),
          menit: 65,
          perhentian: 17,
          warna: { latar: '#d62126', teks: '#ffffff' },
        },
        { jenis: 'jalan', mulai: jam('18:56'), menit: 4, ke: null },
      ],
    })
  })

  it('tanpa jam ketemuan, mengambil pilihan yang paling cepat sampai', () => {
    const hasil = ringkasRute(BLOK_M_KE_KOTA, { ...opsi, jamKetemuan: null })
    expect(hasil).toMatchObject({ status: 'siap', jamKetemuan: null, berangkat: jam('17:34'), sampai: jam('18:54') })
  })

  it('pindah kendaraan lebih sedikit menang kalau selisihnya paling banyak 5 menit', () => {
    const cepatPindah = pilihan(1, krl('DEPOK BARU', 'MANGGARAI', '18:20', '18:52'), krl('MANGGARAI', 'SUDIRMAN', '18:54', '18:57'))
    const langsung5 = pilihan(0, krl('DEPOK BARU', 'SUDIRMAN', '18:19', '19:02'))
    const langsung6 = pilihan(0, krl('DEPOK BARU', 'SUDIRMAN', '18:19', '19:03'))
    expect(ringkasRute([cepatPindah, langsung5], { ...opsi, jamKetemuan: null })).toMatchObject({ sampai: jam('19:02') })
    expect(ringkasRute([cepatPindah, langsung6], { ...opsi, jamKetemuan: null })).toMatchObject({ sampai: jam('18:57') })
  })

  it('jalan kaki langsung juga pilihan tanpa pindah kendaraan', () => {
    const naikTj = pilihan(1, tj('ASEAN', 'Bundaran Senayan', '17:45', '17:55'), tj('Bundaran Senayan', 'Polda Metro Jaya', '17:57', '18:00'))
    const jalanSaja = pilihan(0, jalan('START', 'END', '17:40', '18:03'))
    expect(ringkasRute([naikTj, jalanSaja], { ...opsi, jamKetemuan: null })).toMatchObject({
      langkah: [{ jenis: 'jalan', menit: 23, ke: null }],
    })
  })

  it('merapikan nama KRL yang huruf besar dan memberi awalan Stasiun, juga untuk jalan kaki ke stasiunnya', () => {
    const hasil = ringkasRute(
      [pilihan(0, jalan('START', 'DEPOK BARU', '18:10', '18:11'), krl('DEPOK BARU', 'UNIV. INDONESIA', '18:11', '18:16'))],
      { ...opsi, jamKetemuan: null },
    )
    expect(hasil).toMatchObject({
      langkah: [
        { jenis: 'jalan', ke: 'Stasiun Depok Baru' },
        {
          jenis: 'kereta',
          layanan: 'KRL',
          jalur: 'Commuter Line Bogor',
          arah: 'Jakarta Kota',
          naik: 'Stasiun Depok Baru',
          turun: 'Stasiun Univ. Indonesia',
        },
      ],
    })
  })

  it('membuang arah dan nomor peron di nama halte, dan menulis terminal apa adanya', () => {
    const hasil = ringkasRute(
      [
        pilihan(
          1,
          tj('MH Thamrin 3', 'Cikoko Arah Timur', '18:00', '18:20'),
          tj('Cikoko Arah Timur', 'Term. Pulo Gadung', '18:25', '18:50', { jalurPendek: '4K', arah: 'Pulo Gadung' }),
        ),
      ],
      { ...opsi, jamKetemuan: null },
    )
    expect(hasil).toMatchObject({
      langkah: [
        { naik: 'Halte MH Thamrin', turun: 'Halte Cikoko' },
        { jalur: '4K', arah: 'Pulo Gadung', naik: 'Halte Cikoko', turun: 'Terminal Pulo Gadung' },
      ],
    })
  })

  it('tetap bisa dibaca kalau feed tidak punya operator, nama jalur, atau warna', () => {
    const tanpaData = { operator: null, jalurPendek: null, warna: 'merah', warnaTeks: null }
    const bus = tj('ASEAN', 'Kali Besar', '17:51', '18:56', tanpaData)
    const kereta = krl('CAWANG', 'TEBET', '19:00', '19:03', { ...tanpaData, jalurPanjang: null, ujung: null, warna: '0084D8' })
    const hasil = ringkasRute([pilihan(1, bus, kereta)], { ...opsi, jamKetemuan: null })
    expect(hasil).toMatchObject({
      langkah: [
        { jenis: 'bus', layanan: 'Bus', jalur: 'Blok M - Kota', warna: null },
        // Tanpa nama jalur, sebutannya dipakai. Tanpa stasiun akhir, tulisan arahnya dirapikan. Tanpa warna tulisan, hitam.
        { jenis: 'kereta', layanan: 'Kereta', jalur: 'Kereta', arah: 'Jakartakota', warna: { latar: '#0084d8', teks: '#000000' } },
      ],
    })
  })

  it('tidak menyebut jalan kaki nol detik', () => {
    const hasil = ringkasRute(
      [pilihan(1, krl('DEPOK BARU', 'MANGGARAI', '18:20', '18:52'), jalan('MANGGARAI', 'MANGGARAI', '18:52', '18:52'), krl('MANGGARAI', 'SUDIRMAN', '18:54', '18:57'))],
      { ...opsi, jamKetemuan: null },
    )
    expect(hasil).toMatchObject({ langkah: [{ turun: 'Stasiun Manggarai' }, { naik: 'Stasiun Manggarai', turun: 'Stasiun Sudirman' }] })
  })

  it('mengembalikan jam dari jadwal hari kerja ke hari aslinya', () => {
    const hasil = ringkasRute(BLOK_M_KE_KOTA, { ...opsi, jamKetemuan: jam('19:00') - 2 * HARI, geserMs: 2 * HARI })
    expect(hasil).toMatchObject({ berangkat: jam('17:40') - 2 * HARI, sampai: jam('19:00') - 2 * HARI })
    if (hasil.status !== 'siap') throw new Error(hasil.status)
    expect(hasil.langkah.map((l) => l.mulai)).toEqual([jam('17:40'), jam('17:51'), jam('18:56')].map((t) => t - 2 * HARI))
  })

  it('tanpa pilihan sama sekali, tidak ada rute di jam itu', () => {
    expect(ringkasRute([], { ...opsi, jamKetemuan: jam('23:30') })).toEqual({ status: 'tidak_ada', jamKetemuan: jam('23:30') })
  })
})
