import { useId, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  /** Petunjuk singkat di bawah isian. Diganti pesan galat kalau ada. */
  keterangan?: string
  galat?: string | null
}

/** Isian teks dengan label, petunjuk, dan pesan galat yang dibacakan pembaca layar. */
export function IsianTeks({ label, keterangan, galat, className, ...props }: Props) {
  const id = useId()
  const idBawah = `${id}-bawah`
  const bawah = galat ?? keterangan
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={galat ? true : undefined}
        aria-describedby={bawah ? idBawah : undefined}
        className={
          'w-full min-w-0 rounded-2xl border-3 border-garis bg-kartu px-4 py-3 text-base text-teks shadow-stiker-kecil ' +
          'placeholder:text-teks-redup focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pin-2 ' +
          'aria-invalid:border-merah'
        }
        {...props}
      />
      {bawah && (
        <p id={idBawah} className={`text-sm ${galat ? 'font-semibold text-teks' : 'text-teks-redup'}`}>
          {galat && (
            <span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full border-2 border-garis bg-merah align-middle" />
          )}
          {bawah}
        </p>
      )}
    </div>
  )
}
