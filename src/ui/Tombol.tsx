import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

type Varian = 'utama' | 'biasa'

// Ditekan: turun ke bayangannya dalam 90 ms. Dilepas: kembali dengan pegas.
const DASAR =
  'inline-flex items-center justify-center gap-2 border-garis font-bold no-underline transition-[translate,scale,box-shadow] duration-600 ease-pegas ' +
  'cursor-pointer active:duration-90 active:ease-out motion-reduce:transition-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-pin-2'

const GAYA: Record<Varian, string> = {
  utama:
    'rounded-2xl border-3 bg-merah px-5 py-3 text-base text-tinta shadow-stiker ' +
    'not-disabled:active:translate-[3px] not-disabled:active:scale-x-97 not-disabled:active:scale-y-94 not-disabled:active:shadow-stiker-tekan',
  biasa:
    'rounded-full border-[2.5px] bg-kartu px-4 py-1.5 text-sm text-teks shadow-stiker-kecil ' +
    'not-disabled:active:translate-[2px] not-disabled:active:shadow-none',
}

const kelasTombol = (varian: Varian, tambahan?: string) => `${DASAR} ${GAYA[varian]} ${tambahan ?? ''}`

type PropsTombol = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `utama` untuk satu aksi terpenting di layar, `biasa` untuk sisanya. */
  varian?: Varian
}

export function Tombol({ varian = 'utama', type = 'button', className, ...props }: PropsTombol) {
  return <button type={type} className={kelasTombol(varian, className)} {...props} />
}

type PropsTautan = AnchorHTMLAttributes<HTMLAnchorElement> & { varian?: Varian }

/** Link yang tampil seperti tombol, misalnya ke WhatsApp. Link ke luar app otomatis dibuka di tab baru. */
export function TautanTombol({ varian = 'utama', className, href, children, ...props }: PropsTautan) {
  const keLuar = href?.startsWith('http')
  return (
    <a
      href={href}
      className={kelasTombol(varian, className)}
      {...(keLuar ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...props}
    >
      {children}
    </a>
  )
}
