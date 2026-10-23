import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { galatIsianJam, isianAwal, labelJamKetemuan, pilihanHari, waktuDariIsian, type IsianJam } from '../../domain/jamKetemuan'
import { IsianTeks, PilihanChip, Tombol } from '../../ui'
import type { IdentitasRoom } from '../room/identitas'
import type { Room } from './tipe'

type Props = {
  jamKetemuan: Room['jamKetemuan']
  identitas: IdentitasRoom
  /** Kalimat kecil di bawah jamnya, misalnya akibat jam itu ke pencarian tempat. */
  keterangan?: string
  /** Tombol saat belum diisi. */
  labelAtur?: string
  onIdentitasHilang: () => void
}

/**
 * Jam ketemuan yang opsional, boleh diisi atau diubah siapa saja di room (`room.ubahJamKetemuan`, Discussions #83). Dibaca
 * dan ditampilkan dalam WIB, apa pun zona waktu HP-nya. Seperti Ganti kendaraan, isiannya baru disimpan setelah Simpan ditekan.
 */
export function IsianJamKetemuan({ jamKetemuan, identitas, keterangan, labelAtur = 'Atur jam', onIdentitasHilang }: Props) {
  const ubahJamKetemuan = useMutation(api.room.ubahJamKetemuan)
  const [isian, setIsian] = useState<IsianJam | null>(null)
  const [sekarang, setSekarang] = useState(() => Date.now())
  const [menyimpan, setMenyimpan] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const waktu = jamKetemuan?.waktu ?? null

  function buka() {
    const kini = Date.now()
    setSekarang(kini)
    setGalat(null)
    setIsian(isianAwal(waktu, kini))
  }

  async function simpan(baru: number | null) {
    setGalat(null)
    setMenyimpan(true)
    try {
      await ubahJamKetemuan({ ...identitas, jamKetemuan: baru })
      setIsian(null)
    } catch (e) {
      const kode = e instanceof ConvexError ? (e.data as { galat?: string } | undefined)?.galat : undefined
      if (kode === 'PESERTA_TIDAK_DIKENAL') return onIdentitasHilang()
      setGalat(
        kode === 'JAM_KETEMUAN_TIDAK_VALID'
          ? 'Jam itu sudah lewat atau lebih dari 7 hari lagi. Pilih jam lain.'
          : 'Jam ketemuan belum tersimpan. Cek koneksi internetmu, lalu coba lagi.',
      )
    } finally {
      setMenyimpan(false)
    }
  }

  if (isian === null) {
    return (
      <div className="flex flex-col gap-1 self-stretch border-t-2 border-garis/15 pt-3" data-jam-ketemuan>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            Jam ketemuan{' '}
            {waktu === null ? (
              <span className="text-teks-redup">belum diatur</span>
            ) : (
              <b className="tabular-nums">{labelJamKetemuan(waktu, sekarang)}</b>
            )}
          </p>
          <Tombol varian="biasa" onClick={buka} className="min-h-11">
            {waktu === null ? labelAtur : 'Ubah'}
          </Tombol>
        </div>
        {keterangan && <p className="text-sm text-teks-redup">{keterangan}</p>}
      </div>
    )
  }

  const galatIsian = galatIsianJam(isian, sekarang)
  return (
    <div className="flex flex-col gap-3 self-stretch border-t-2 border-garis/15 pt-3" data-isian-jam-ketemuan>
      <PilihanChip judul="Hari ketemuan" pilihan={pilihanHari(sekarang)} nilai={isian.tanggal} onUbah={(tanggal) => setIsian({ ...isian, tanggal })} />
      <IsianTeks
        label="Jam (WIB)"
        type="time"
        step={60}
        required
        value={isian.jam}
        onChange={(e) => setIsian({ ...isian, jam: e.target.value })}
        keterangan="Dipakai untuk jadwal KRL dan TransJakarta, dan tempat yang tutup di jam itu tidak ikut dicari."
        galat={isian.jam ? galatIsian : null}
      />
      <div className="flex flex-wrap gap-2">
        {/* Bukan langkah utama room, jadi tidak merah: tombol merahnya tetap milik keadaan room (cek-ux.md §1). */}
        <Tombol
          varian="biasa"
          onClick={() => simpan(waktuDariIsian(isian))}
          disabled={menyimpan || galatIsian !== null || waktuDariIsian(isian) === waktu}
          className="min-h-11 min-w-28"
        >
          {menyimpan ? 'Menyimpan…' : 'Simpan'}
        </Tombol>
        {waktu !== null && (
          <Tombol varian="biasa" onClick={() => simpan(null)} disabled={menyimpan} className="min-h-11">
            Hapus jam
          </Tombol>
        )}
        <Tombol varian="biasa" onClick={() => setIsian(null)} disabled={menyimpan} className="min-h-11">
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
