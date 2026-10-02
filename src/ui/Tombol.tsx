import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `utama` untuk satu aksi terpenting di layar, `biasa` untuk sisanya. */
  varian?: 'utama' | 'biasa'
}

// Ditekan: turun ke bayangannya dalam 90 ms. Dilepas: kembali dengan pegas.
const DASAR =
  'inline-flex items-center justify-center gap-2 border-garis font-bold transition-[translate,scale,box-shadow] duration-600 ease-pegas ' +
  'enabled:cursor-pointer enabled:active:duration-90 enabled:active:ease-out motion-reduce:transition-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-pin-2'

const GAYA = {
  utama:
    'rounded-2xl border-3 bg-merah px-5 py-3 text-base text-tinta shadow-stiker ' +
    'enabled:active:translate-[3px] enabled:active:scale-x-97 enabled:active:scale-y-94 enabled:active:shadow-stiker-tekan',
  biasa:
    'rounded-full border-[2.5px] bg-kartu px-4 py-1.5 text-sm text-teks shadow-stiker-kecil ' +
    'enabled:active:translate-[2px] enabled:active:shadow-none',
}

export function Tombol({ varian = 'utama', type = 'button', className, ...props }: Props) {
  return <button type={type} className={`${DASAR} ${GAYA[varian]} ${className ?? ''}`} {...props} />
}
