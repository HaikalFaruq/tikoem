/** Banyaknya warna pin. Kuning bintang sengaja tidak termasuk karena khusus untuk tempat kumpul. */
const JUMLAH_WARNA_PIN = 8

/** Putaran warna ke-1, ke-2, dan ke-3 dibedakan dengan aksesori: cukup untuk 24 orang per room. */
const AKSESORI_PIN = ['polos', 'kacamata', 'pita'] as const

type NomorWarnaPin = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
type AksesoriPin = (typeof AKSESORI_PIN)[number]
export type GayaPin = { warna: NomorWarnaPin; aksesori: AksesoriPin }

/**
 * Warna dan aksesori pin dari `urutanGabung` (mulai dari 1) yang dikirim backend, jadi sama di semua HP.
 * Orang ke-1 sampai ke-8 polos, ke-9 sampai ke-16 berkacamata, ke-17 sampai ke-24 berpita (docs/desain/identitas.html).
 */
export function warnaPin(urutanGabung: number): GayaPin {
  if (!Number.isInteger(urutanGabung) || urutanGabung < 1) {
    throw new RangeError(`urutanGabung harus bilangan bulat mulai dari 1, bukan ${urutanGabung}`)
  }
  const indeks = urutanGabung - 1
  return {
    warna: ((indeks % JUMLAH_WARNA_PIN) + 1) as NomorWarnaPin,
    aksesori: AKSESORI_PIN[Math.floor(indeks / JUMLAH_WARNA_PIN) % AKSESORI_PIN.length],
  }
}
