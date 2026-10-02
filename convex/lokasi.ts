import { ConvexError, v } from 'convex/values'
import { action, env } from './_generated/server'
import { NominatimGagal, cariAlamat } from './nominatim'

/** Untuk fitur ketik alamat di layar gabung. Pilihan yang diambil lalu dikirim lewat `room.kirimLokasi`, yang menyamarkannya. */
export const cari = action({
  args: { teks: v.string() },
  handler: async (_ctx, { teks }) => {
    try {
      return await cariAlamat(teks, { url: env.NOMINATIM_URL })
    } catch (galat) {
      if (galat instanceof NominatimGagal) throw new ConvexError({ galat: 'LAYANAN_GAGAL' as const })
      throw galat
    }
  },
})
