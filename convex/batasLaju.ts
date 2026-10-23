import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { v, type Infer } from 'convex/values'
import { components, internal } from './_generated/api'
import { env, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from './_generated/server'
import { vLayananBerjeda } from './schema'
import { TransitousGagal, TransitousSibuk } from './transitous'
import { jedaBertahap } from '../src/lib/waktu'

/**
 * Batas pemakaian layanan luar. Berlaku untuk seluruh app, bukan per orang, karena semua permintaan keluar dari server
 * Convex yang sama dan aturan layanannya dihitung per aplikasi.
 */
export const batasLaju = new RateLimiter(components.rateLimiter, {
  /**
   * Nominatim milik OSMF membolehkan paling banyak satu permintaan per detik untuk semua pengguna app digabung.
   * Jaraknya 1,1 detik, sama dengan jeda tombol cari di layar. Paling banyak tiga permintaan boleh antre (sekitar
   * 3 detik), dan sisanya langsung ditolak supaya orang bisa coba lagi atau memakai GPS.
   */
  nominatim: { kind: 'token bucket', rate: 1, period: 1100, capacity: 1, maxReserved: 3 },
  /**
   * Matrix ORS paket gratis membolehkan 40 permintaan dalam 60 detik mana pun. Isi 10 ditambah 30 per menit tidak pernah
   * melewati 40 di jendela 60 detik mana pun. Paling banyak lima permintaan boleh antre (sekitar 10 detik), supaya hitung
   * tetap selesai sebelum `BATAS_HITUNG_MS`. Kuota hariannya (500) dihitung ORS sejak permintaan pertama, jadi tidak
   * ditiru di sini. Kalau habis, ORS menjawab 403 dan room berakhir LAYANAN_GAGAL seperti galat ORS lainnya.
   */
  ors: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10, maxReserved: 5 },
  /**
   * Transitous membolehkan sekitar 30 permintaan per menit untuk seluruh app (channel Matrix Transitous, #58). Isi 10
   * ditambah 20 per menit tidak pernah melewati 30 di jendela 60 detik mana pun. Tiap orang yang naik transportasi umum
   * butuh satu permintaan. Paling banyak tiga permintaan boleh antre (sekitar 9 detik), supaya hitung tetap selesai sebelum
   * `BATAS_HITUNG_MS`.
   */
  transitous: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 10, maxReserved: 3 },
})

/** Menunggu giliran memakai layanan luar. `false` kalau antreannya sudah penuh, dan jatahnya tidak terpakai. */
export async function tungguGiliran(ctx: ActionCtx, layanan: 'nominatim' | 'ors' | 'transitous') {
  const { ok, retryAfter } = await batasLaju.limit(ctx, layanan, { reserve: true })
  if (ok && retryAfter) await new Promise((lanjut) => setTimeout(lanjut, retryAfter))
  return ok
}

/**
 * Menunggu giliran ke Transitous asli, untuk Cari tempat dan ringkasan rute. Selama jeda setelah 429 atau kalau antreannya
 * penuh, langsung gagal tanpa bertanya ke sana.
 */
export async function giliranTransitous(ctx: ActionCtx) {
  const jedaSampai: number | null = await ctx.runQuery(internal.batasLaju.jeda, { layanan: 'transitous' })
  if (jedaSampai !== null && Date.now() < jedaSampai) throw new TransitousGagal('Transitous masih meminta jeda')
  if (!(await tungguGiliran(ctx, 'transitous'))) throw new TransitousGagal('Antrean Transitous penuh')
}

/** Kalau Transitous asli menjawab 429, room lain ikut berhenti bertanya ke sana sampai jedanya habis. */
export async function catatKalauSibuk(ctx: ActionCtx, galat: unknown) {
  if (galat instanceof TransitousSibuk && !env.TRANSITOUS_URL) {
    await ctx.runMutation(internal.batasLaju.catatSibuk, { layanan: 'transitous', mintaJedaMs: galat.mintaJedaMs })
  }
}

const jedaDari = (ctx: QueryCtx, layanan: Infer<typeof vLayananBerjeda>) =>
  ctx.db
    .query('jedaLayanan')
    .withIndex('by_layanan', (q) => q.eq('layanan', layanan))
    .unique()

/** Sampai kapan permintaan ke layanan itu ditahan setelah dijawab 429, atau `null` kalau belum pernah. */
export const jeda = internalQuery({
  args: { layanan: vLayananBerjeda },
  handler: async (ctx, { layanan }) => (await jedaDari(ctx, layanan))?.sampai ?? null,
})

/**
 * Dicatat saat layanan menjawab 429, supaya permintaan berikutnya dari room mana pun ditahan dulu. Transitous meminta app
 * mundur dengan jeda, bukan langsung mengirim ulang (#58). Lamanya dihitung `jedaBertahap` di src/lib/waktu.ts.
 */
export const catatSibuk = internalMutation({
  args: { layanan: vLayananBerjeda, mintaJedaMs: v.optional(v.number()) },
  handler: async (ctx, { layanan, mintaJedaMs }) => {
    const lama = await jedaDari(ctx, layanan)
    const baru = jedaBertahap(Date.now(), lama, mintaJedaMs)
    if (lama) await ctx.db.patch('jedaLayanan', lama._id, baru)
    else await ctx.db.insert('jedaLayanan', { layanan, ...baru })
  },
})
