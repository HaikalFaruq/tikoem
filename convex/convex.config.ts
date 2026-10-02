import { defineApp } from 'convex/server'
import { v } from 'convex/values'

/** Env app yang bertipe. Nilainya diisi lewat `npx convex env set`, tidak pernah lewat variabel VITE_* (AGENTS.md §8). */
const app = defineApp({
  env: {
    /** Key OpenRouteService untuk waktu tempuh. Tanpa key ini, hitung berakhir dengan LAYANAN_GAGAL. */
    ORS_API_KEY: v.optional(v.string()),
    // Alamat layanan luar. Kosong berarti server asli. E2E mengisinya dengan server tiruan (e2e/layanan-tiruan.ts).
    OVERPASS_URL: v.optional(v.string()),
    ORS_URL: v.optional(v.string()),
    NOMINATIM_URL: v.optional(v.string()),
  },
})

export default app
