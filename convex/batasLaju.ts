import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { components } from './_generated/api'
import type { ActionCtx } from './_generated/server'

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
})

/** Menunggu giliran memakai layanan luar. `false` kalau antreannya sudah penuh, dan jatahnya tidak terpakai. */
export async function tungguGiliran(ctx: ActionCtx, layanan: 'nominatim' | 'ors') {
  const { ok, retryAfter } = await batasLaju.limit(ctx, layanan, { reserve: true })
  if (ok && retryAfter) await new Promise((lanjut) => setTimeout(lanjut, retryAfter))
  return ok
}
