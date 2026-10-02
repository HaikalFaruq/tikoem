import { describe, expect, it } from 'vitest'
import { linkRoom, linkWhatsApp, teksUndangan } from './undangan'

describe('undangan', () => {
  it('membuat link room dari alamat app, dengan atau tanpa garis miring di akhir', () => {
    expect(linkRoom('https://tikoem.app', 'ABC234')).toBe('https://tikoem.app/r/ABC234')
    expect(linkRoom('https://tikoem.app/', 'ABC234')).toBe('https://tikoem.app/r/ABC234')
  })

  it('menaruh link di akhir pesan supaya WhatsApp menampilkan pratinjaunya', () => {
    expect(teksUndangan('https://tikoem.app/r/ABC234').endsWith('https://tikoem.app/r/ABC234')).toBe(true)
  })

  it('membuat link wa.me dengan pesan yang di-encode utuh', () => {
    const teks = 'Yuk kumpul: https://tikoem.app/r/ABC234?x=1&y=2'
    const link = new URL(linkWhatsApp(teks))
    expect(link.origin + link.pathname).toBe('https://wa.me/')
    expect(link.searchParams.get('text')).toBe(teks)
  })
})
