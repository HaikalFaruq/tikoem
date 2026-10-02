import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const vStatusRoom = v.union(
  v.literal('menunggu_peserta'),
  v.literal('menghitung'),
  v.literal('siap'),
  v.literal('gagal'),
)
export const vKendaraan = v.union(v.literal('motor'), v.literal('mobil'), v.literal('jalan_kaki'))
export const vTitik = v.object({ lat: v.number(), lng: v.number() })
/** Sama dengan `KategoriTempat` di src/domain/tempat.ts. Stasiun belum dicari (Discussions #8). */
export const vKategoriTempat = v.union(v.literal('kafe'), v.literal('resto'), v.literal('mall'), v.literal('stasiun'))

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

  kandidat: defineTable({
    roomId: v.id('room'),
    osmId: v.string(),
    nama: v.string(),
    kategori: vKategoriTempat,
    lokasi: vTitik,
    /** Nama jalan dari `addr:street` OSM, diringkas. Tidak ada kalau OSM tidak punya datanya. */
    alamat: v.optional(v.string()),
    jarakDariTengahMeter: v.number(),
    /** Diisi setelah waktu tempuh dihitung lewat OpenRouteService. */
    waktuTempuh: v.optional(v.array(v.object({ pesertaId: v.id('peserta'), menit: v.number() }))),
  }).index('by_roomId', ['roomId']),

  vote: defineTable({
    roomId: v.id('room'),
    pesertaId: v.id('peserta'),
    kandidatId: v.id('kandidat'),
  })
    .index('by_roomId', ['roomId'])
    .index('by_pesertaId', ['pesertaId']),
})
