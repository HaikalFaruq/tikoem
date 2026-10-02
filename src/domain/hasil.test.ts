import { describe, expect, it } from 'vitest'
import { barisWaktuTempuh, keadaanCariTempat, labelKategori, linkMaps } from './hasil'

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
