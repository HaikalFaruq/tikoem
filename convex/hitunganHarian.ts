import { v, type Infer } from 'convex/values'
import { internalQuery, type MutationCtx } from './_generated/server'
import { vJenisHitungan } from './schema'
import { tanggalJakarta } from '../src/lib/waktu'

type JenisHitungan = Infer<typeof vJenisHitungan>

/** Menambah satu ke hitungan hari ini (waktu Jakarta), di transaksi mutation yang memanggilnya. */
export async function tambahHitungan(ctx: MutationCtx, jenis: JenisHitungan) {
  const tanggal = tanggalJakarta(Date.now())
  const baris = await ctx.db
    .query('hitunganHarian')
    .withIndex('by_tanggal_and_jenis', (q) => q.eq('tanggal', tanggal).eq('jenis', jenis))
    .unique()
  if (baris) await ctx.db.patch('hitunganHarian', baris._id, { jumlah: baris.jumlah + 1 })
  else await ctx.db.insert('hitunganHarian', { tanggal, jenis, jumlah: 1 })
}

/** Paling banyak satu baris per jenis per hari. */
const JUMLAH_JENIS = vJenisHitungan.members.length

/**
 * Hitungan beberapa hari terakhir, yang terbaru dulu. Hanya untuk dibaca dari terminal, misalnya
 * `npx convex run --prod hitunganHarian:ringkas '{"hari": 30}'`, bukan dari layar.
 */
export const ringkas = internalQuery({
  args: { hari: v.optional(v.number()) },
  handler: async (ctx, { hari = 14 }) => {
    const baris = await ctx.db
      .query('hitunganHarian')
      .withIndex('by_tanggal_and_jenis')
      .order('desc')
      .take(Math.max(1, Math.min(hari, 366)) * JUMLAH_JENIS)
    const perTanggal = new Map<string, Partial<Record<JenisHitungan, number>>>()
    for (const b of baris) perTanggal.set(b.tanggal, { ...perTanggal.get(b.tanggal), [b.jenis]: b.jumlah })
    return [...perTanggal].slice(0, hari).map(([tanggal, jumlah]) => ({ tanggal, ...jumlah }))
  },
})
