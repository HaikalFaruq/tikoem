import { expect, test } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
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
