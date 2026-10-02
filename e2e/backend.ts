/** Backend Convex lokal untuk E2E. Di CI dibuat anonim, di laptop memakai deployment lokal dari `npx convex dev`. */
export const URL_BACKEND = 'http://127.0.0.1:3210'

/** Server tiruan untuk Overpass, ORS, dan Nominatim (e2e/layanan-tiruan.ts). */
export const PORT_TIRUAN = 4319
export const URL_TIRUAN = `http://127.0.0.1:${PORT_TIRUAN}`

/**
 * Di CI selalu dipakai. Di laptop hanya kalau diminta dengan `E2E_LAYANAN_TIRUAN=1`, karena env deployment Convex-mu
 * ikut diubah selama E2E berjalan. Setelah E2E selesai, env-nya dikembalikan.
 */
export const PAKAI_LAYANAN_TIRUAN = Boolean(process.env.CI || process.env.E2E_LAYANAN_TIRUAN)

/**
 * Lokasi khusus untuk E2E keadaan gagal. Taruh semua peserta di sekitar titik ini supaya titik tengahnya juga di sana.
 * - `LOKASI_TANPA_TEMPAT`: Overpass tiruan tidak menemukan tempat, jadi hitung berakhir dengan TEMPAT_TIDAK_DITEMUKAN.
 * - `LOKASI_LAYANAN_GAGAL`: Overpass tiruan menjawab 503, jadi hitung berakhir dengan LAYANAN_GAGAL.
 */
export const LOKASI_TANPA_TEMPAT = { lat: -70, lng: 0 }
export const LOKASI_LAYANAN_GAGAL = { lat: 70, lng: 0 }
