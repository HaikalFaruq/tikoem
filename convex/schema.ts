import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const vStatusRoom = v.union(
  v.literal('menunggu_peserta'),
  v.literal('menghitung'),
  v.literal('siap'),
  v.literal('gagal'),
)
export const vGalatHitung = v.union(v.literal('TEMPAT_TIDAK_DITEMUKAN'), v.literal('LAYANAN_GAGAL'))
export const vKendaraan = v.union(v.literal('motor'), v.literal('mobil'), v.literal('jalan_kaki'))
export const vTitik = v.object({ lat: v.number(), lng: v.number() })
/** Sama dengan `KategoriTempat` di src/domain/tempat.ts. Stasiun belum dicari (Discussions #8). */
export const vKategoriTempat = v.union(v.literal('kafe'), v.literal('resto'), v.literal('mall'), v.literal('stasiun'))

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
    /** Waktu hasil terakhir keluar. */
    hasilPada: v.optional(v.number()),
    /** Naik setiap tombol "Cari tempat" ditekan. Hasil dari putaran yang sudah lewat diabaikan. */
    putaranHitung: v.optional(v.number()),
    /** Naik setiap ada lokasi yang berubah. Kalau berbeda dengan `versiHasil`, hasilnya usang (Discussions #8). */
    versiLokasi: v.optional(v.number()),
    versiHasil: v.optional(v.number()),
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
})
