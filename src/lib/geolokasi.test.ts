import { describe, expect, it } from 'vitest'
import { pesanGalatGeolokasi } from './geolokasi'

describe('pesanGalatGeolokasi', () => {
  it('memberi pesan berbeda untuk izin ditolak, lokasi tidak tersedia, dan waktu habis', () => {
    const pesan = [0, 1, 2, 3].map(pesanGalatGeolokasi)
    expect(new Set(pesan).size).toBe(4)
    expect(pesanGalatGeolokasi(1)).toContain('Izin lokasi ditolak')
    expect(pesanGalatGeolokasi(3)).toContain('terlalu lama')
  })

  it('tetap memberi pesan untuk kode yang tidak dikenal', () => {
    expect(pesanGalatGeolokasi(99)).toBe('Lokasimu belum bisa dibaca. Coba lagi.')
  })
})
