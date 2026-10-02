import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAction } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { rapikanTeksCari, type HasilCariAlamat } from '../../domain/alamat'
import type { Titik } from '../../domain/lokasi'
import { IsianTeks, Tombol } from '../../ui'

/** Nominatim mengizinkan paling banyak satu permintaan per detik, jadi tombol cari istirahat sebentar setelah dipakai. */
const JEDA_CARI_MS = 1100

type Props = {
  /** Dipanggil saat salah satu pilihan diketuk. Boleh melempar. Pesan galatnya diurus pemanggil. */
  onPilih: (lokasi: Titik) => Promise<void>
  sibuk: boolean
}

/**
 * Ketik alamat untuk yang tidak bisa memakai GPS. Pencarian jalan saat tombol ditekan, bukan di setiap ketikan,
 * karena Nominatim melarang autocomplete. Teks pencarian dan hasilnya hanya ada di layar ini, tidak disimpan.
 */
export function CariAlamat({ onPilih, sibuk }: Props) {
  const cari = useAction(api.lokasi.cari)
  const [teks, setTeks] = useState('')
  const [hasil, setHasil] = useState<HasilCariAlamat[] | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const [mencari, setMencari] = useState(false)
  const [istirahat, setIstirahat] = useState(false)
  const pengatur = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(pengatur.current), [])

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = rapikanTeksCari(teks)
    if (!q) {
      setGalat('Ketik minimal 3 huruf, misalnya nama jalan, gedung, atau kelurahan.')
      setHasil(null)
      return
    }
    setGalat(null)
    setMencari(true)
    setIstirahat(true)
    pengatur.current = window.setTimeout(() => setIstirahat(false), JEDA_CARI_MS)
    try {
      setHasil(await cari({ teks: q }))
    } catch (galatCari) {
      setHasil(null)
      const kode = galatCari instanceof ConvexError ? (galatCari.data as { galat?: string } | undefined)?.galat : undefined
      setGalat(
        kode === 'LAYANAN_GAGAL'
          ? 'Pencarian alamat sedang gangguan. Coba lagi sebentar lagi, atau pakai GPS.'
          : 'Pencarian belum berhasil. Cek koneksi internetmu, lalu coba lagi.',
      )
    } finally {
      setMencari(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form noValidate onSubmit={kirim} className="flex min-w-0 items-end gap-2">
        <IsianTeks
          label="Ketik alamat atau nama tempat"
          name="alamat"
          type="search"
          enterKeyHint="search"
          autoComplete="street-address"
          placeholder="Misal: Kota Kasablanka"
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          className="flex-1"
        />
        <Tombol varian="biasa" type="submit" disabled={mencari || istirahat || sibuk} className="mb-1.5 shrink-0">
          {mencari ? 'Mencari…' : 'Cari'}
        </Tombol>
      </form>
      {galat && (
        <p role="alert" className="text-sm font-semibold">
          {galat}
        </p>
      )}
      <div aria-live="polite" className="flex flex-col gap-2">
        {hasil && hasil.length === 0 && (
          <p className="text-sm">Alamat tidak ketemu. Coba nama jalan, gedung, atau kelurahan yang lain.</p>
        )}
        {hasil && hasil.length > 0 && <p className="text-sm text-teks-redup">Pilih yang paling dekat dengan lokasimu:</p>}
      </div>
      {hasil && hasil.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {hasil.map((h) => (
              <li key={`${h.label}|${h.lokasi.lat}|${h.lokasi.lng}`}>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => onPilih(h.lokasi)}
                  className={
                    'w-full cursor-pointer rounded-2xl border-[2.5px] border-garis bg-kartu px-3.5 py-2.5 text-left text-sm font-semibold text-teks shadow-stiker-kecil ' +
                    'transition-[translate,box-shadow] duration-600 ease-pegas active:translate-[2px] active:shadow-none active:duration-90 motion-reduce:transition-none ' +
                    'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pin-2'
                  }
                >
                  {h.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
