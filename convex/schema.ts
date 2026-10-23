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
/**
 * Sama dengan `KategoriTempat` di src/domain/tempat.ts. `stasiun` mencakup stasiun KRL dan halte TransJakarta, dan hanya
 * dicari kalau ada yang naik transportasi umum (Discussions #63).
 */
export const vKategoriTempat = v.union(v.literal('kafe'), v.literal('resto'), v.literal('mall'), v.literal('stasiun'))
/**
 * Jenis hitungan harian (#78): `cari` untuk setiap Cari tempat yang mulai, dan `gagal_*` untuk yang berakhir LAYANAN_GAGAL
 * menurut layanan penyebabnya. `gagal_batas_waktu` berarti hitungnya belum selesai setelah `BATAS_HITUNG_MS`.
 */
export const vJenisHitungan = v.union(
  v.literal('cari'),
  v.literal('gagal_overpass'),
  v.literal('gagal_ors'),
  v.literal('gagal_transitous'),
  v.literal('gagal_batas_waktu'),
  v.literal('gagal_lain'),
)

/** Layanan luar yang meminta app mundur dulu setelah menjawab 429 (convex/batasLaju.ts). */
export const vLayananBerjeda = v.literal('transitous')

/** Satu langkah ringkasan rute (Discussions #83). Waktu dalam milidetik, nama halte dan stasiun tanpa koordinat. */
const vLangkah = v.union(
  v.object({ jenis: v.literal('jalan'), mulai: v.number(), menit: v.number(), ke: v.union(v.string(), v.null()) }),
  v.object({
    jenis: v.union(v.literal('kereta'), v.literal('bus')),
    layanan: v.string(),
    jalur: v.string(),
    arah: v.string(),
    naik: v.string(),
    turun: v.string(),
    mulai: v.number(),
    menit: v.number(),
    perhentian: v.number(),
    warna: v.union(v.object({ latar: v.string(), teks: v.string() }), v.null()),
  }),
)

/**
 * Ringkasan rute satu orang ke tempat yang ditetapkan (Discussions #83), yaitu `peserta[].rute` di `room.lihat`. Bentuk
 * `tidak_ada` dan `siap` dibuat `ringkasRute` di src/domain/ringkasanRute.ts.
 */
export const vRingkasanRute = v.union(
  v.object({ status: v.literal('menghitung') }),
  v.object({ status: v.literal('gagal') }),
  v.object({ status: v.literal('tidak_ada'), jamKetemuan: v.union(v.number(), v.null()) }),
  v.object({
    status: v.literal('siap'),
    /** Jam ketemuan yang dipakai: sampai paling lambat jam ini. `null` berarti dihitung untuk berangkat pada `dihitungPada`. */
    jamKetemuan: v.union(v.number(), v.null()),
    dihitungPada: v.number(),
    berangkat: v.number(),
    sampai: v.number(),
    langkah: v.array(vLangkah),
  }),
)

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
     * Naik setiap ada lokasi atau kendaraan orang yang ikut dihitung berubah, atau jam ketemuan berubah. Kalau berbeda dengan
     * `versiHasil`, hasilnya usang (Discussions #8 dan #83).
     */
    versiLokasi: v.optional(v.number()),
    versiHasil: v.optional(v.number()),
    /** Tempat yang sudah ditetapkan untuk semua orang (Discussions #42). Selama terisi, vote dan hitung ditolak. */
    tetap: v.optional(v.object({ kandidatId: v.id('kandidat'), olehPesertaId: v.id('peserta'), pada: v.number() })),
    /**
     * Jam ketemuan yang diisi salah satu orang di room (Discussions #83). Jadi jam berangkat transportasi umum saat tempat
     * dicari. Dikosongkan saat room berakhir.
     */
    jamKetemuan: v.optional(v.object({ waktu: v.number(), olehPesertaId: v.id('peserta') })),
    /**
     * Naik setiap ada ringkasan rute di room ini yang perlu dihitung (Discussions #83). Tidak pernah turun walaupun ringkasannya
     * dihapus, jadi hasil yang datang terlambat dari sebelum tempat dibuka lagi tidak menimpa ringkasan yang baru.
     */
    putaranRingkasan: v.optional(v.number()),
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
   * Ringkasan rute ke tempat yang ditetapkan, satu baris per orang yang naik transportasi umum (Discussions #83). Isinya
   * tanpa koordinat, dan dihapus saat tempat dibuka lagi, saat orangnya keluar, dan saat room berakhir (AGENTS.md §8).
   */
  ringkasanRute: defineTable({
    roomId: v.id('room'),
    pesertaId: v.id('peserta'),
    /** Naik setiap ringkasan orang ini perlu dihitung ulang. Hasil dari putaran yang sudah lewat diabaikan. */
    putaran: v.number(),
    ringkasan: vRingkasanRute,
  })
    .index('by_roomId', ['roomId'])
    .index('by_pesertaId', ['pesertaId']),

  /**
   * Jeda untuk seluruh app setelah layanan luar menjawab 429. Satu baris per layanan, tanpa data pengguna. Selama `sampai`
   * belum lewat, permintaan ke layanan itu tidak dikirim. `lamaMs` adalah lama jeda terakhir, untuk jeda berikutnya.
   */
  jedaLayanan: defineTable({ layanan: vLayananBerjeda, sampai: v.number(), lamaMs: v.number() }).index('by_layanan', ['layanan']),

  /**
   * Hitungan harian Cari tempat dan LAYANAN_GAGAL per layanan, sebagai bahan keputusan cache Overpass (#78). Isinya tanpa
   * koordinat, tanpa room, dan tanpa data orang, jadi tidak ikut dihapus bersama room. Dibaca lewat `hitunganHarian.ringkas`.
   */
  hitunganHarian: defineTable({
    /** Tanggal di Jakarta, misalnya "2026-10-23". */
    tanggal: v.string(),
    jenis: vJenisHitungan,
    jumlah: v.number(),
  }).index('by_tanggal_and_jenis', ['tanggal', 'jenis']),
})
