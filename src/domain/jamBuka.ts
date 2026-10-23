const MENIT_HARI = 24 * 60
/** Jakarta memakai WIB (UTC+7) sepanjang tahun, tanpa jam musim panas. */
const SELISIH_WIB_MS = 7 * 60 * 60 * 1000

/** Singkatan hari di `opening_hours` OSM, ditambah tiga huruf ("Thu", "Fri") yang kadang dipakai di data Jakarta. */
const NOMOR_HARI: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const SEMUA_HARI = [0, 1, 2, 3, 4, 5, 6]

/** Menit dari tengah malam. Ujungnya boleh lewat 24 jam untuk jam buka yang lewat tengah malam. */
type Rentang = [mulai: number, akhir: number]
type Jadwal = { perHari: (Rentang[] | undefined)[]; adaLibur: boolean }

/** Hari dari pemilih seperti "Mo-Fr,Su" atau "Su-Th". `PH` (hari libur) dicatat terpisah. `null` kalau tidak dikenali. */
function bacaHari(pemilih: string): { hari: number[]; libur: boolean } | null {
  const hari = new Set<number>()
  let libur = false
  for (const bagian of pemilih.split(',')) {
    if (bagian === 'PH') {
      libur = true
      continue
    }
    const [awal, akhir, ...lebih] = bagian.split('-')
    const dari = NOMOR_HARI[awal]
    const sampai = akhir === undefined ? dari : NOMOR_HARI[akhir]
    if (dari === undefined || sampai === undefined || lebih.length > 0) return null
    for (let h = dari; ; h = (h + 1) % 7) {
      hari.add(h)
      if (h === sampai) break
    }
  }
  return { hari: [...hari], libur }
}

/** "07:00-15:00,17:00-01:00" jadi menit. Jam selesai yang sama dengan jam mulai tidak jelas artinya, jadi tidak dikenali. */
function bacaRentang(isi: string): Rentang[] | null {
  if (isi === 'off' || isi === 'closed') return []
  if (isi === '24/7') return [[0, MENIT_HARI]]
  const hasil: Rentang[] = []
  for (const bagian of isi.split(',')) {
    const cocok = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(bagian)
    if (!cocok) return null
    const [jamMulai, menitMulai, jamAkhir, menitAkhir] = cocok.slice(1).map(Number)
    const mulai = jamMulai * 60 + menitMulai
    const akhir = jamAkhir * 60 + menitAkhir
    if (menitMulai > 59 || menitAkhir > 59 || mulai >= MENIT_HARI || akhir > 2 * MENIT_HARI || akhir === mulai) return null
    // Selesai lebih awal dari mulai berarti lewat tengah malam, misalnya 10:00-01:00. "00:00" sebagai selesai berarti tengah malam.
    hasil.push([mulai, akhir < mulai ? akhir + MENIT_HARI : akhir])
  }
  return hasil
}

/**
 * Jadwal mingguan dari bentuk `opening_hours` yang umum di Jakarta, atau `null` kalau ada bagian yang tidak dikenali.
 * Aturan yang dipisah ";" menimpa hari yang disebutnya, dan aturan tambahan yang dipisah "," setelah jam menambah jam buka.
 */
function bacaJadwal(nilai: string): Jadwal | null {
  const rapi = nilai.trim().replace(/\s*([-,;])\s*/g, '$1').replace(/\s+/g, ' ')
  const perHari: (Rentang[] | undefined)[] = Array.from({ length: 7 }, () => undefined)
  let adaLibur = false
  for (const aturanUtama of rapi.split(';').filter(Boolean)) {
    // Koma di antara jam dan hari memisahkan aturan tambahan: "Mo-Fr 08:30-19:00, Su 08:30-13:00".
    for (const [i, aturan] of aturanUtama.split(/(?<=\d),(?=[A-Z])/).entries()) {
      const cocok = /^(?:([A-Za-z,-]+) )?(\S+)$/.exec(aturan)
      const pemilih = cocok?.[1] === undefined ? { hari: SEMUA_HARI, libur: false } : bacaHari(cocok[1])
      const rentang = cocok ? bacaRentang(cocok[2]) : null
      if (!pemilih || !rentang) return null
      adaLibur ||= pemilih.libur
      for (const h of pemilih.hari) perHari[h] = i === 0 ? rentang : [...(perHari[h] ?? []), ...rentang]
    }
  }
  return { perHari, adaLibur }
}

/**
 * Apakah tempat buka pada `waktu` (jam Jakarta) menurut tag `opening_hours` OSM (Discussions #74). `false` hanya kalau
 * jelas tutup. `null` kalau tidak tahu: bentuknya tidak dikenali (misalnya "sunrise-sunset"), atau ada aturan hari libur
 * (`PH`) yang bisa membuatnya buka, karena Tikoem tidak tahu tanggal itu hari libur atau bukan.
 */
export function bukaPada(nilai: string, waktu: number): boolean | null {
  const jadwal = bacaJadwal(nilai)
  if (!jadwal) return null
  const saat = new Date(waktu + SELISIH_WIB_MS)
  const hari = saat.getUTCDay()
  const menit = saat.getUTCHours() * 60 + saat.getUTCMinutes()
  // Jam buka kemarin yang lewat tengah malam ikut dihitung, misalnya Senin 10:00-02:00 masih buka Selasa pukul 01.00.
  const kemarin = jadwal.perHari[(hari + 6) % 7] ?? []
  const buka =
    (jadwal.perHari[hari] ?? []).some(([mulai, akhir]) => mulai <= menit && menit < akhir) ||
    kemarin.some(([mulai, akhir]) => mulai <= menit + MENIT_HARI && menit + MENIT_HARI < akhir)
  if (buka) return true
  return jadwal.adaLibur ? null : false
}
