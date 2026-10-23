import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexError } from 'convex/values'
import { api } from '../convex/_generated/api'
import { URL_BACKEND } from './backend'

test('backend Convex lokal membuat room dan menerima peserta', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const { kode } = await convex.mutation(api.room.buat, { nama: 'Pembuat E2E', kendaraan: 'motor' })
  await convex.mutation(api.room.gabung, { kode, nama: 'Teman E2E', kendaraan: 'jalan_kaki' })

  expect(await convex.query(api.room.lihat, { kode })).toMatchObject({
    ok: true,
    room: { kode, status: 'menunggu_peserta' },
    peserta: [
      { nama: 'Pembuat E2E', kendaraan: 'motor', urutanGabung: 1, lokasi: null },
      { nama: 'Teman E2E', kendaraan: 'jalan_kaki', urutanGabung: 2, lokasi: null },
    ],
  })
})

test('jam ketemuan tersimpan tanpa detik dan jam yang sudah lewat ditolak (Discussions #83)', async () => {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const { kode, pesertaId, kunci } = await convex.mutation(api.room.buat, { nama: 'Pembuat E2E', kendaraan: 'transportasi_umum' })
  const jam = Math.floor((Date.now() + 2 * 60 * 60_000) / 60_000) * 60_000

  await convex.mutation(api.room.ubahJamKetemuan, { pesertaId, kunci, jamKetemuan: jam + 15_000 })
  expect(await convex.query(api.room.lihat, { kode })).toMatchObject({ ok: true, room: { jamKetemuan: { waktu: jam, olehPesertaId: pesertaId } } })

  const galat = await convex.mutation(api.room.ubahJamKetemuan, { pesertaId, kunci, jamKetemuan: Date.now() - 60 * 60_000 }).then(
    () => null,
    (e: unknown) => (e instanceof ConvexError ? (e.data as { galat: string }).galat : String(e)),
  )
  expect(galat).toBe('JAM_KETEMUAN_TIDAK_VALID')
})
