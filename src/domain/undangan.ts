import { jalurRoom } from './rute'

/** Link lengkap yang dibagikan, misalnya `https://tikoem.vercel.app/r/ABC234`. */
export const linkRoom = (asal: string, kode: string) => `${asal.replace(/\/+$/, '')}${jalurRoom(kode)}`

/** Pesan yang langsung terisi di WhatsApp. Link ditaruh terakhir supaya WA menampilkan pratinjaunya. */
export const teksUndangan = (link: string) =>
  `Yuk tentuin tempat ketemuan yang adil buat semua. Isi nama dan lokasimu di Tikoem: ${link}`

/** wa.me tanpa nomor membuka WhatsApp dengan pilihan chat atau grup tujuan. */
export const linkWhatsApp = (teks: string) => `https://wa.me/?text=${encodeURIComponent(teks)}`
