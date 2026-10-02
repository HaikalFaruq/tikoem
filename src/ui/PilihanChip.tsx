import { useId } from 'react'

type Pilihan<T extends string> = { nilai: T; label: string }

type Props<T extends string> = {
  judul: string
  pilihan: readonly Pilihan<T>[]
  nilai: T
  onUbah: (nilai: T) => void
}

/** Satu pilihan dari beberapa chip. Memakai radio asli, jadi tombol panah dan pembaca layar langsung bekerja. */
export function PilihanChip<T extends string>({ judul, pilihan, nilai, onUbah }: Props<T>) {
  const nama = useId()
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 p-0">
      <legend className="mb-2 text-sm font-semibold">{judul}</legend>
      {pilihan.map((p) => (
        <label
          key={p.nilai}
          className={
            'cursor-pointer rounded-full border-[2.5px] border-garis bg-kartu px-3.5 py-1.5 text-sm font-semibold text-teks shadow-stiker-kecil ' +
            'transition-[translate,box-shadow] duration-600 ease-pegas active:translate-[2px] active:shadow-none active:duration-90 motion-reduce:transition-none ' +
            'has-checked:bg-bintang has-checked:text-tinta has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-pin-2'
          }
        >
          <input
            type="radio"
            className="sr-only"
            name={nama}
            value={p.nilai}
            checked={p.nilai === nilai}
            onChange={() => onUbah(p.nilai)}
          />
          {p.label}
        </label>
      ))}
    </fieldset>
  )
}
