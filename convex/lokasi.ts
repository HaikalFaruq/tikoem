import { ConvexError, v } from 'convex/values'
import { action, env, type ActionCtx } from './_generated/server'
import { tungguGiliran } from './batasLaju'
import { NominatimGagal, cariAlamat } from './nominatim'

/** Menunggu giliran ke Nominatim OSMF. Kalau antreannya sudah penuh, langsung gagal tanpa memakai jatah. */
async function antreNominatim(ctx: ActionCtx) {
  if (!(await tungguGiliran(ctx, 'nominatim'))) throw new NominatimGagal('Antrean Nominatim penuh')
}

/** Untuk fitur ketik alamat di layar gabung. Pilihan yang diambil lalu dikirim lewat `room.kirimLokasi`, yang menyamarkannya. */
export const cari = action({
  args: { teks: v.string() },
  handler: async (ctx, { teks }) => {
    try {
      // Batas satu permintaan per detik hanya untuk server Nominatim OSMF (bawaan). Server lain yang diisi lewat
      // NOMINATIM_URL, termasuk server tiruan E2E, punya aturannya sendiri.
      const antre = env.NOMINATIM_URL ? undefined : () => antreNominatim(ctx)
      return await cariAlamat(teks, { url: env.NOMINATIM_URL, antre })
    } catch (galat) {
      if (galat instanceof NominatimGagal) throw new ConvexError({ galat: 'LAYANAN_GAGAL' as const })
      throw galat
    }
  },
})
