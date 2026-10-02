import { describe, expect, it } from 'vitest'
import { bacaRute, jalurRoom } from './rute'

describe('bacaRute', () => {
  it('membuka beranda untuk alamat selain link room', () => {
    expect(bacaRute('/')).toEqual({ nama: 'beranda' })
    expect(bacaRute('/tentang')).toEqual({ nama: 'beranda' })
    expect(bacaRute('/r/')).toEqual({ nama: 'beranda' })
  })

  it('membaca kode room dan merapikan huruf kecil dari link', () => {
    expect(bacaRute('/r/ABC234')).toEqual({ nama: 'room', kode: 'ABC234' })
    expect(bacaRute('/r/abc234/')).toEqual({ nama: 'room', kode: 'ABC234' })
  })

  it('meneruskan kode yang formatnya salah, supaya layar room yang menolaknya', () => {
    expect(bacaRute('/r/salah')).toEqual({ nama: 'room', kode: 'salah' })
  })

  it('bolak-balik dengan jalurRoom', () => {
    expect(bacaRute(jalurRoom('XYZ789'))).toEqual({ nama: 'room', kode: 'XYZ789' })
  })
})
