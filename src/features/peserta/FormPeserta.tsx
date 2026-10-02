import { useState, type FormEvent } from 'react'
import { ConvexError } from 'convex/values'
import { KENDARAAN, type Kendaraan } from '../../domain/kendaraan'
import { MAKS_PANJANG_NAMA, rapikanNama } from '../../domain/peserta'
import { IsianTeks, PilihanChip, Tombol } from '../../ui'

const PESAN_NAMA = `Isi namamu, maksimal ${MAKS_PANJANG_NAMA} karakter.`
const PESAN_UMUM = 'Belum berhasil. Cek koneksi internetmu, lalu coba lagi.'

export type DataPeserta = { nama: string; kendaraan: Kendaraan }

type Props = {
  labelTombol: string
  labelMengirim: string
  /** Boleh melempar `ConvexError`. `NAMA_TIDAK_VALID` ditampilkan di isian nama, kode lain memakai `pesanGalat`. */
  onKirim: (data: DataPeserta) => Promise<void>
  pesanGalat?: Partial<Record<string, string>>
}

/** Nama dan kendaraan: dipakai saat membuat room dan saat gabung, dengan aturan nama yang sama dengan backend. */
export function FormPeserta({ labelTombol, labelMengirim, onKirim, pesanGalat }: Props) {
  const [nama, setNama] = useState('')
  const [kendaraan, setKendaraan] = useState<Kendaraan>('motor')
  const [galatNama, setGalatNama] = useState<string | null>(null)
  const [galatUmum, setGalatUmum] = useState<string | null>(null)
  const [mengirim, setMengirim] = useState(false)

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGalatUmum(null)
    const namaRapi = rapikanNama(nama)
    if (!namaRapi) {
      setGalatNama(PESAN_NAMA)
      return
    }
    setGalatNama(null)
    setMengirim(true)
    try {
      await onKirim({ nama: namaRapi, kendaraan })
    } catch (galat) {
      const kode = galat instanceof ConvexError ? (galat.data as { galat?: string } | undefined)?.galat : undefined
      if (kode === 'NAMA_TIDAK_VALID') setGalatNama(PESAN_NAMA)
      else setGalatUmum((kode && pesanGalat?.[kode]) || PESAN_UMUM)
    } finally {
      setMengirim(false)
    }
  }

  return (
    <form noValidate onSubmit={kirim} className="flex flex-col gap-5">
      <IsianTeks
        label="Namamu"
        name="nama"
        autoComplete="given-name"
        enterKeyHint="next"
        placeholder="Misal: Bintang"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        keterangan="Teman-temanmu melihat nama ini di room."
        galat={galatNama}
      />
      <PilihanChip judul="Kamu berangkat naik apa?" pilihan={KENDARAAN} nilai={kendaraan} onUbah={setKendaraan} />
      {galatUmum && (
        <p role="alert" className="text-sm font-semibold">
          {galatUmum}
        </p>
      )}
      <Tombol type="submit" disabled={mengirim} className="w-full">
        {mengirim ? labelMengirim : labelTombol}
      </Tombol>
    </form>
  )
}
