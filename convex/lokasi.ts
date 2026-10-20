import { ConvexError, v } from 'convex/values'
import { action, env, type ActionCtx } from './_generated/server'
import { tungguGiliran } from './batasLaju'
import { NominatimGagal, alamatDariTitik, cariAlamat, type OpsiNominatim } from './nominatim'
import { vTitik } from './schema'
import { titikValid } from '../src/domain/lokasi'

/** Menunggu giliran ke Nominatim OSMF. Kalau antreannya sudah penuh, langsung gagal tanpa memakai jatah. */
async function antreNominatim(ctx: ActionCtx) {
  if (!(await tungguGiliran(ctx, 'nominatim'))) throw new NominatimGagal('Antrean Nominatim penuh')
}

/** Menjalankan permintaan ke Nominatim dengan antrean yang sesuai. Kegagalan Nominatim jadi galat LAYANAN_GAGAL. */
async function lewatNominatim<T>(ctx: ActionCtx, kerja: (opsi: OpsiNominatim) => Promise<T>): Promise<T> {
  try {
    // Batas satu permintaan per detik hanya untuk server Nominatim OSMF (bawaan). Server lain yang diisi lewat
    // NOMINATIM_URL, termasuk server tiruan E2E, punya aturannya sendiri.
    return await kerja({ url: env.NOMINATIM_URL, antre: env.NOMINATIM_URL ? undefined : () => antreNominatim(ctx) })
  } catch (galat) {
    if (galat instanceof NominatimGagal) throw new ConvexError({ galat: 'LAYANAN_GAGAL' as const })
    throw galat
  }
}

/** Untuk fitur ketik alamat di layar gabung. Pilihan yang diambil lalu dikirim lewat `room.kirimLokasi`, yang menyamarkannya. */
export const cari = action({
  args: { teks: v.string() },
  handler: (ctx, { teks }) => lewatNominatim(ctx, (opsi) => cariAlamat(teks, opsi)),
})

/**
 * Label di bawah pin saat lokasi dipilih di peta (#53). Titiknya tidak disimpan dan tidak ditulis ke log. Antreannya sama
 * dengan `cari`, jadi layar sebaiknya memanggil ini setelah peta berhenti digeser, bukan selama digeser.
 */
export const alamat = action({
  args: { lokasi: vTitik },
  handler: async (ctx, { lokasi }): Promise<{ label: string } | null> => {
    if (!titikValid(lokasi)) throw new ConvexError({ galat: 'LOKASI_TIDAK_VALID' as const })
    const label = await lewatNominatim(ctx, (opsi) => alamatDariTitik(lokasi, opsi))
    return label === null ? null : { label }
  },
})
