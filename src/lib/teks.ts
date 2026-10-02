const segmenter = new Intl.Segmenter('id', { granularity: 'grapheme' })

/** Huruf pertama nama untuk avatar. Emoji dan huruf beraksen dihitung utuh sebagai satu karakter. */
export function inisial(nama: string): string {
  const pertama = segmenter.segment(nama.trim())[Symbol.iterator]().next()
  return pertama.done ? '?' : pertama.value.segment.toLocaleUpperCase('id')
}
