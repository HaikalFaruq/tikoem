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

/**
 * Titik di Teluk Jakarta, jauh dari jalan. Taruh satu peserta di sini dan yang lain di darat: ORS tiruan menjawab seperti
 * ORS 9 asli (titiknya `null` di `sources`), jadi hitung berakhir dengan LOKASI_TIDAK_TERJANGKAU untuk orang itu.
 */
export const LOKASI_TIDAK_TERJANGKAU = { lat: -6.05, lng: 106.85 }

/**
 * Titik di Cileungsi, jauh dari halte TransJakarta dan stasiun KRL. Transitous tiruan tidak menemukan rute dari sini, jadi
 * orang yang naik transportasi umum dari titik ini membuat hitung berakhir dengan TRANSPORTASI_UMUM_TIDAK_TERJANGKAU.
 */
export const LOKASI_TANPA_TRANSPORTASI_UMUM = { lat: -6.4, lng: 107 }

/**
 * Titik di Lebak Bulus. Ringkasan rute pertama untuk orang yang naik transportasi umum dari sini berakhir `gagal`, lalu
 * berhasil setelah `room.hitungRute` (Coba lagi). Cari tempat dari titik ini tetap berjalan biasa.
 */
export const LOKASI_RUTE_GAGAL_SEKALI = { lat: -6.289, lng: 106.774 }
