import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  terbuka: boolean
  /** Dipanggil setiap dialog tertutup: tombol di dalamnya, Esc, tombol kembali di HP, atau ketukan di luar kartu. */
  onTutup: () => void
  /** Judul dialog. Diberi `tabIndex={-1}`, karena fokus pindah ke sini saat dialog dibuka supaya pembaca layar membacanya dulu. */
  idJudul: string
  idIsi?: string
  className?: string
  children: ReactNode
}

/**
 * Pop up bergaya stiker di atas layar, memakai `<dialog>` bawaan browser, jadi fokus terkunci di dalamnya dan kembali
 * ke tempat semula setelah ditutup. Di HP kartunya menempel di bawah supaya terjangkau jempol.
 */
export function DialogStiker({ terbuka, onTutup, idJudul, idIsi, className, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (terbuka && !el.open) {
      el.showModal()
      el.querySelector<HTMLElement>(`#${idJudul}`)?.focus()
    }
    if (!terbuka && el.open) el.close()
  }, [terbuka, idJudul])

  return (
    // Ketukan di latar mengenai `<dialog>` itu sendiri, karena kartunya mengisi seluruh dialog. Keyboard memakai Esc dari browser.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialog}
      aria-labelledby={idJudul}
      aria-describedby={idIsi}
      onClose={onTutup}
      onClick={(e) => {
        if (e.target === e.currentTarget) onTutup()
      }}
      className={
        'mx-auto mt-auto mb-[max(1rem,env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-sm overflow-visible bg-transparent p-0 text-teks sm:mb-auto ' +
        'backdrop:bg-tinta/60 motion-safe:animate-naik motion-safe:backdrop:animate-pudar'
      }
    >
      <div
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-stiker border-3 border-garis bg-kartu shadow-stiker ${className ?? ''}`}
      >
        {children}
      </div>
    </dialog>
  )
}
