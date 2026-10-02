import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { KENDARAAN, type Kendaraan } from '../../domain/kendaraan'
import { MAKS_PANJANG_NAMA, rapikanNama } from '../../domain/peserta'
import { IlustrasiKumpul, IsianTeks, KartuStiker, PilihanChip, Pin, Tombol } from '../../ui'
import { simpanIdentitas } from '../room/identitas'

const PESAN_NAMA = `Isi namamu, maksimal ${MAKS_PANJANG_NAMA} karakter.`

type Props = {
  /** Dipanggil setelah room jadi dan identitas pembuatnya tersimpan. */
  onDibuat: (kode: string) => void
}

export function LayarBuatRoom({ onDibuat }: Props) {
  const buat = useMutation(api.room.buat)
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
      const { kode, pesertaId, kunci } = await buat({ nama: namaRapi, kendaraan })
      simpanIdentitas(kode, { pesertaId, kunci })
      onDibuat(kode)
    } catch (galat) {
      setMengirim(false)
      if (galat instanceof ConvexError && galat.data?.galat === 'NAMA_TIDAK_VALID') setGalatNama(PESAN_NAMA)
      else setGalatUmum('Room belum berhasil dibuat. Cek koneksi internetmu, lalu coba lagi.')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-4 pt-10 pb-16">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Pin warna={1} ukuran={44} />
          <h1 className="font-display text-5xl font-extrabold tracking-[-0.05em] [font-variation-settings:'opsz'_96] [text-shadow:3px_3px_0_var(--color-merah)]">
            Tikoem
          </h1>
        </div>
        <p className="text-lg text-balance">Tempat ketemuan yang waktu tempuhnya paling seimbang buat semua teman.</p>
      </header>

      <IlustrasiKumpul className="px-6" />

      <KartuStiker as="section" aria-labelledby="buat-judul" className="flex min-w-0 flex-col gap-5 p-5">
        <h2 id="buat-judul" className="font-display text-2xl font-extrabold tracking-[-0.03em]">
          Buat room
        </h2>
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
            {mengirim ? 'Membuat room…' : 'Buat room'}
          </Tombol>
        </form>
      </KartuStiker>

      <section aria-labelledby="cara-judul" className="flex flex-col gap-3">
        <h2 id="cara-judul" className="font-display text-xl font-extrabold tracking-[-0.03em]">
          Cara kerjanya
        </h2>
        <ol className="flex flex-col gap-3">
          {[
            'Buat room, lalu kirim link-nya ke grup WA.',
            'Tiap teman isi nama dan berbagi lokasi. Tanpa akun.',
            'Tikoem mencari tempat yang waktu tempuh terlamanya paling pendek, jadi tidak ada yang jauh sendiri.',
          ].map((langkah, i) => (
            <li key={langkah} className="flex gap-3">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full border-[2.5px] border-garis bg-bintang text-sm font-extrabold text-tinta"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{langkah}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
