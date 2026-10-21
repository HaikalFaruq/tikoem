import { describe, expect, it } from 'vitest'
import { labelKendaraan } from './kendaraan'

describe('labelKendaraan', () => {
  it('memberi label semua kendaraan dari backend, termasuk transportasi umum', () => {
    expect(labelKendaraan('jalan_kaki')).toBe('Jalan kaki')
    expect(labelKendaraan('transportasi_umum')).toBe('Transportasi umum')
  })
})
