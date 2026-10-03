/** Label pendek untuk pin di peta: kata pertama nama, dipotong kalau masih terlalu panjang. */
export function namaPendek(nama: string, maks = 10): string {
  const kata = nama.trim().split(/\s+/)[0] ?? ''
  const huruf = Array.from(kata)
  return huruf.length > maks ? `${huruf.slice(0, maks - 1).join('')}…` : kata
}

/** Jarak yang mudah dibaca: "400 m" atau "2,3 km". */
export function formatJarak(meter: number): string {
  const meterBulat = Math.max(0, Math.round(meter / 10) * 10)
  if (meterBulat < 1000) return `${meterBulat} m`
  return `${(meter / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km`
}
