import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article'
}

/** Permukaan stiker: outline tebal dan bayangan keras. Dipakai untuk satu objek yang memang terpisah, bukan untuk semua blok. */
export function KartuStiker({ as: Tag = 'div', className, ...props }: Props) {
  return <Tag className={`rounded-stiker border-3 border-garis bg-kartu shadow-stiker ${className ?? ''}`} {...props} />
}
