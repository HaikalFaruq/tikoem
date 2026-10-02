import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { URL_BACKEND } from './backend'

// Backend sudah menerima koneksi sebelum `npx convex dev` selesai mengirim fungsi, jadi tunggu sampai fungsi room bisa dipanggil.
export default async function siapkanBackend() {
  const convex = new ConvexHttpClient(URL_BACKEND)
  const batas = Date.now() + 120_000
  for (;;) {
    try {
      await convex.query(api.room.lihat, { kode: 'ZZZZZZ' })
      return
    } catch (galat) {
      if (Date.now() > batas) throw galat
      await new Promise((lanjut) => setTimeout(lanjut, 1000))
    }
  }
}
