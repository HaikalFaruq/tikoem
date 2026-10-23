/** Luminans relatif WCAG dari warna heksa enam digit, dengan atau tanpa "#". */
function luminans(heksa: string): number {
  const angka = heksa.replace(/^#/, '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(angka.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rasio kontras WCAG antara dua warna, dari 1 sampai 21. */
export function kontrasWarna(a: string, b: string): number {
  const la = luminans(a)
  const lb = luminans(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
