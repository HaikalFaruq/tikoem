type Dipilih<Id> = { id: Id; peringkat: number; pemilih: readonly unknown[] }

/**
 * Tempat untuk kartu hasil: vote terbanyak. Kalau seri, termasuk kalau belum ada yang vote, peringkat keadilan yang menang (Discussions #8).
 * Dipakai frontend dan backend supaya kartu hasil di semua HP sama.
 */
export function pilihanAkhir<Id>(kandidat: readonly Dipilih<Id>[]): Id | null {
  let terbaik: Dipilih<Id> | null = null
  for (const k of kandidat) {
    if (
      !terbaik ||
      k.pemilih.length > terbaik.pemilih.length ||
      (k.pemilih.length === terbaik.pemilih.length && k.peringkat < terbaik.peringkat)
    ) {
      terbaik = k
    }
  }
  return terbaik?.id ?? null
}
