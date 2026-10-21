import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { KENDARAAN, labelKendaraan, type Kendaraan } from '../../domain/kendaraan'
import { PilihanChip, Tombol } from '../../ui'
import { KeteranganTransportasiUmum } from '../peserta/SumberTransitous'
import type { IdentitasRoom } from './identitas'

type Props = {
  identitas: IdentitasRoom
  kendaraan: Kendaraan
  /** Jadi aksi utama (merah), misalnya saat kendaraan ini membuat waktu tempuhnya tidak bisa dihitung. */
  utama?: boolean
  onIdentitasHilang: () => void
}

/**
 * Kendaraan bisa diganti tanpa keluar room (`room.ubahKendaraan`, Discussions #63). Pilihannya baru disimpan setelah
 * Simpan ditekan, supaya menjelajah chip dengan tombol panah tidak menyimpan setiap pilihan yang dilewati.
 */
export function GantiKendaraan({ identitas, kendaraan, utama = false, onIdentitasHilang }: Props) {
  const ubahKendaraan = useMutation(api.room.ubahKendaraan)
  const [pilihan, setPilihan] = useState<Kendaraan | null>(null)
  const [menyimpan, setMenyimpan] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  async function simpan() {
    if (pilihan === null) return
    setGalat(null)
    setMenyimpan(true)
    try {
      await ubahKendaraan({ ...identitas, kendaraan: pilihan })
      setPilihan(null)
    } catch (e) {
      const kode = e instanceof ConvexError ? (e.data as { galat?: string } | undefined)?.galat : undefined
      if (kode === 'PESERTA_TIDAK_DIKENAL') return onIdentitasHilang()
      setGalat('Kendaraanmu belum tersimpan. Cek koneksi internetmu, lalu coba lagi.')
    } finally {
      setMenyimpan(false)
    }
  }

  if (pilihan === null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-garis/15 pt-3">
        <p className="text-sm">
          Berangkat naik <b>{labelKendaraan(kendaraan)}</b>
        </p>
        <Tombol
          varian={utama ? 'utama' : 'biasa'}
          onClick={() => setPilihan(kendaraan)}
          className={utama ? 'w-full' : 'min-h-11'}
        >
          Ganti kendaraan
        </Tombol>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-t-2 border-garis/15 pt-3" data-ganti-kendaraan>
      <PilihanChip judul="Ganti kendaraan" pilihan={KENDARAAN} nilai={pilihan} onUbah={setPilihan} />
      {pilihan === 'transportasi_umum' && <KeteranganTransportasiUmum />}
      <p className="text-sm text-teks-redup">Kalau tempatnya sudah dicari, hasilnya perlu dihitung ulang.</p>
      <div className="flex flex-wrap gap-2">
        {/* Bukan langkah utama room, jadi tidak merah: tombol merahnya tetap milik keadaan room (cek-ux.md §1). */}
        <Tombol varian="biasa" onClick={simpan} disabled={menyimpan || pilihan === kendaraan} className="min-h-11 min-w-28">
          {menyimpan ? 'Menyimpan…' : 'Simpan'}
        </Tombol>
        <Tombol varian="biasa" onClick={() => setPilihan(null)} disabled={menyimpan} className="min-h-11">
          Batal
        </Tombol>
      </div>
      {galat && (
        <p role="alert" className="text-sm font-semibold">
          {galat}
        </p>
      )}
    </div>
  )
}
