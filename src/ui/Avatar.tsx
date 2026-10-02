import { inisial } from '../lib/teks'
import type { WarnaPin } from './Pin'

type Props = {
  nama: string
  /** Sama dengan warna pin orangnya, supaya daftar dan peta gampang dicocokkan. */
  warna: WarnaPin
  className?: string
}

/** Huruf pertama nama di lingkaran warna pin. Hiasan: nama lengkapnya selalu ditulis di sebelahnya. */
export function Avatar({ nama, warna, className }: Props) {
  return (
    <span
      aria-hidden
      className={`grid size-8 shrink-0 place-items-center rounded-full border-[2.5px] border-garis text-sm font-extrabold text-tinta ${className ?? ''}`}
      style={{ backgroundColor: `var(--color-pin-${warna})` }}
    >
      {inisial(nama)}
    </span>
  )
}
