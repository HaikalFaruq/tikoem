import { describe, expect, it } from 'vitest'
import { barisWaktuTempuh, keadaanCariTempat, labelKategori, linkMaps, teksHasil } from './hasil'

const room = (status: 'menunggu_peserta' | 'menghitung' | 'siap' | 'gagal', tambahan = {}) => ({
  status,
  galatHitung: null,
  hasilUsang: false,
  ...tambahan,
})

describe('keadaanCariTempat', () => {
  it('menunggu minimal 2 orang berbagi lokasi sebelum tombol cari aktif', () => {
    expect(keadaanCariTempat(room('menunggu_peserta'), 1, 3)).toEqual({ jenis: 'kurang_lokasi', berbagi: 1, total: 3 })
    expect(keadaanCariTempat(room('menunggu_peserta'), 2, 3)).toEqual({ jenis: 'bisa_dicari', berbagi: 2, total: 3 })
  })

  it('mengikuti status menghitung, siap, dan gagal dari backend', () => {
    expect(keadaanCariTempat(room('menghitung'), 3, 3)).toEqual({ jenis: 'menghitung' })
    expect(keadaanCariTempat(room('siap', { hasilUsang: true }), 3, 3)).toEqual({ jenis: 'siap', usang: true, bisaHitungUlang: true })
    expect(keadaanCariTempat(room('gagal', { galatHitung: 'LAYANAN_GAGAL' }), 3, 3)).toEqual({
      jenis: 'gagal',
      galat: 'LAYANAN_GAGAL',
      bisaDicobaLagi: true,
    })
  })

  it('tidak menawarkan hitung ulang atau coba lagi kalau lokasinya tinggal kurang dari 2', () => {
    expect(keadaanCariTempat(room('siap', { hasilUsang: true }), 1, 2)).toMatchObject({ bisaHitungUlang: false })
    expect(keadaanCariTempat(room('gagal'), 1, 2)).toMatchObject({ bisaDicobaLagi: false })
  })
})

describe('barisWaktuTempuh', () => {
  const peserta = [
    { id: 'b', urutanGabung: 2, nama: 'Bintang' },
    { id: 'h', urutanGabung: 1, nama: 'Haikal' },
  ]

  it('mengurutkan menurut urutan gabung dan melewati orang yang sudah keluar', () => {
    const baris = barisWaktuTempuh(
      [
        { pesertaId: 'b', menit: 27 },
        { pesertaId: 'keluar', menit: 40 },
        { pesertaId: 'h', menit: 24 },
      ],
      peserta,
    )
    expect(baris.map((b) => [b.peserta.nama, b.menit])).toEqual([
      ['Haikal', 24],
      ['Bintang', 27],
    ])
  })
})

describe('label dan link', () => {
  it('memberi label kategori yang mudah dibaca', () => {
    expect(labelKategori('mall')).toBe('Mal')
    expect(labelKategori('kafe')).toBe('Kafe')
  })

  it('membuka koordinat tempat di Google Maps', () => {
    const url = new URL(linkMaps({ lat: -6.223, lng: 106.843 }))
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/')
    expect(url.searchParams.get('query')).toBe('-6.223,106.843')
  })
})

describe('teksHasil', () => {
  const isi = {
    namaTempat: 'Kafe Taman Tebet',
    kategori: 'kafe' as const,
    alamat: 'Jl. Tebet Raya',
    lokasi: { lat: -6.227, lng: 106.854 },
    baris: [
      { nama: 'Haikal', menit: 24 },
      { nama: 'Bintang', menit: 27 },
    ],
    terlamaMenit: 27,
    jumlahPemilih: 2,
    jumlahPeserta: 3,
    linkRoom: 'https://tikoem.vercel.app/r/ABC234',
  }

  it('memuat nama tempat tebal, link Maps, waktu tempuh tiap orang, dan link room di akhir', () => {
    const teks = teksHasil(isi)
    expect(teks).toContain('Ketemuan di *Kafe Taman Tebet* (Kafe · Jl. Tebet Raya)')
    expect(teks).toContain('https://www.google.com/maps/search/?api=1&query=-6.227,106.854')
    expect(teks).toContain('Haikal 24 mnt, Bintang 27 mnt. Terlama 27 mnt.')
    expect(teks).toContain('Dipilih 2 dari 3 orang.')
    expect(teks.endsWith('https://tikoem.vercel.app/r/ABC234')).toBe(true)
  })

  it('tanpa alamat dan tanpa suara tetap rapi', () => {
    const teks = teksHasil({ ...isi, alamat: null, jumlahPemilih: 0 })
    expect(teks).toContain('(Kafe)')
    expect(teks).toContain('Belum ada yang memilih, jadi ini tempat yang paling adil.')
  })
})
