import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const vStatusRoom = v.union(
  v.literal('menunggu_peserta'),
  v.literal('menghitung'),
  v.literal('siap'),
  v.literal('gagal'),
)
export const vGalatHitung = v.union(
  v.literal('TEMPAT_TIDAK_DITEMUKAN'),
  v.literal('LAYANAN_GAGAL'),
  v.literal('LOKASI_TIDAK_TERJANGKAU'),
  v.literal('TRANSPORTASI_UMUM_TIDAK_TERJANGKAU'),
)
/** Transportasi umum (TransJakarta dan KRL) dihitung lewat Transitous, yang lain lewat ORS (Discussions #63). */
export const vKendaraan = v.union(v.literal('motor'), v.literal('mobil'), v.literal('jalan_kaki'), v.literal('transportasi_umum'))
export const vTitik = v.object({ lat: v.number(), lng: v.number() })
/** Sama dengan `KategoriTempat` di src/domain/tempat.ts. Stasiun belum dicari (Discussions #8). */
export const vKategoriTempat = v.union(v.literal('kafe'), v.literal('resto'), v.literal('mall'), v.literal('stasiun'))
/** Layanan luar yang meminta app mundur dulu setelah menjawab 429 (convex/batasLaju.ts). */
export const vLayananBerjeda = v.literal('transitous')

/** Satu kandidat hasil hitung, tanpa `roomId`. Dipakai tabel `kandidat` dan argumen `hitung.simpan`. */
export const vKandidat = v.object({
  osmId: v.string(),
  nama: v.string(),
  kategori: vKategoriTempat,
  lokasi: vTitik,
  /** Nama jalan dari `addr:street` OSM, diringkas. Tidak ada kalau OSM tidak punya datanya. */
  alamat: v.optional(v.string()),
  jarakDariTengahMeter: v.number(),
  /** Menit dari tiap peserta yang ikut dihitung, dibulatkan ke atas. */
  waktuTempuh: v.array(v.object({ pesertaId: v.id('peserta'), menit: v.number() })),
  terlamaMenit: v.number(),
  selisihMenit: v.number(),
  /** 1 berarti paling adil. */
  peringkat: v.number(),
})

export default defineSchema({
  room: defineTable({
    kode: v.string(),
    status: vStatusRoom,
    kedaluwarsaPada: v.number(),
    /** Dipasang fungsi terjadwal tepat di `kedaluwarsaPada`, karena query tidak boleh membaca jam. */
    kedaluwarsa: v.optional(v.boolean()),
    /** Sumber `urutanGabung` berikutnya. Tidak pernah turun walaupun ada yang keluar. */
    jumlahGabung: v.number(),
    titikTengah: v.optional(vTitik),
    /** Terisi saat status `gagal`. */
    galatHitung: v.optional(vGalatHitung),
    /**
     * Terisi bersama galat LOKASI_TIDAK_TERJANGKAU, untuk orang yang lokasinya terlalu jauh dari jalan (#53), atau
     * TRANSPORTASI_UMUM_TIDAK_TERJANGKAU, untuk orang yang tidak punya rute transportasi umum ke tempat mana pun (Discussions #63).
     * Dikosongkan saat orang itu mengirim lokasi baru, saat dia mengganti kendaraan setelah galat transportasi umum, atau saat
     * Cari tempat ditekan lagi.
     */
    pesertaTidakTerjangkau: v.optional(v.id('peserta')),
    /** Waktu hasil terakhir keluar. */
    hasilPada: v.optional(v.number()),
    /** Naik setiap tombol "Cari tempat" ditekan. Hasil dari putaran yang sudah lewat diabaikan. */
    putaranHitung: v.optional(v.number()),
    /**
     * Naik setiap ada lokasi atau kendaraan orang yang ikut dihitung berubah. Kalau berbeda dengan `versiHasil`, hasilnya usang
     * (Discussions #8).
     */
    versiLokasi: v.optional(v.number()),
    versiHasil: v.optional(v.number()),
    /** Tempat yang sudah ditetapkan untuk semua orang (Discussions #42). Selama terisi, vote dan hitung ditolak. */
    tetap: v.optional(v.object({ kandidatId: v.id('kandidat'), olehPesertaId: v.id('peserta'), pada: v.number() })),
  }).index('by_kode', ['kode']),

  peserta: defineTable({
    roomId: v.id('room'),
    nama: v.string(),
    kendaraan: vKendaraan,
    urutanGabung: v.number(),
    /** Rahasia yang hanya dipegang HP peserta itu, untuk mengubah datanya sendiri. Tidak pernah dikirim ke peserta lain. */
    kunci: v.string(),
    /** Sudah disamarkan sekitar 110 m sebelum disimpan (src/domain/lokasi.ts). */
    lokasi: v.optional(vTitik),
  }).index('by_roomId_and_urutanGabung', ['roomId', 'urutanGabung']),

  kandidat: defineTable({ roomId: v.id('room'), ...vKandidat.fields }).index('by_roomId_and_peringkat', ['roomId', 'peringkat']),

  vote: defineTable({
    roomId: v.id('room'),
    pesertaId: v.id('peserta'),
    kandidatId: v.id('kandidat'),
  })
    .index('by_roomId', ['roomId'])
    .index('by_pesertaId', ['pesertaId']),

  /**
   * Jeda untuk seluruh app setelah layanan luar menjawab 429. Satu baris per layanan, tanpa data pengguna. Selama `sampai`
   * belum lewat, permintaan ke layanan itu tidak dikirim. `lamaMs` adalah lama jeda terakhir, untuk jeda berikutnya.
   */
  jedaLayanan: defineTable({ layanan: vLayananBerjeda, sampai: v.number(), lamaMs: v.number() }).index('by_layanan', ['layanan']),
})
