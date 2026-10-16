/** Halaman traktir Tikoem di Sociabuzz. */
export const LINK_TRAKTIR = 'https://sociabuzz.com/byhund/tribe'

type KeadaanTraktir = {
  /** `room.status === 'menghitung'`. */
  menghitung: boolean
  /** `room.putaranHitung` sekarang. */
  putaran: number
  /** `room.putaranHitung` saat layar room dibuka di HP ini. */
  putaranAwal: number
  /** Pop up traktir sudah pernah muncul untuk room ini di HP ini. */
  sudahMuncul: boolean
}

/**
 * Pop up traktir muncul saat tempat mulai dicari, karena semua orang di room sedang menunggu hasil. Sekali per room di
 * tiap HP, supaya tidak mengganggu saat hitung ulang. Putaran yang naik ikut dihitung: kalau layanan menjawab cepat,
 * status `menghitung` bisa sudah lewat sebelum sampai ke HP lain.
 */
export function waktunyaTraktir({ menghitung, putaran, putaranAwal, sudahMuncul }: KeadaanTraktir): boolean {
  return !sudahMuncul && (menghitung || putaran > putaranAwal)
}
