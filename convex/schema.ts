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

export default defineSchema({
  room: defineTable({
    kode: v.string(),
    status: vStatusRoom,
    kedaluwarsaPada: v.number(),
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
  }).index('by_room', ['roomId']),

  kandidat: defineTable({
    roomId: v.id('room'),
    osmId: v.string(),
    nama: v.string(),
    kategori: v.string(),
    lokasi: vTitik,
    jarakDariTengahMeter: v.number(),
    /** Diisi setelah waktu tempuh dihitung lewat OpenRouteService. */
    waktuTempuh: v.optional(v.array(v.object({ pesertaId: v.id('peserta'), menit: v.number() }))),
  }).index('by_room', ['roomId']),

  vote: defineTable({
    roomId: v.id('room'),
    pesertaId: v.id('peserta'),
    kandidatId: v.id('kandidat'),
  })
    .index('by_room', ['roomId'])
    .index('by_peserta', ['pesertaId']),
})
