import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { sisaWaktu } from '../../lib/waktu'
import { KartuStiker, Pin, Tombol } from '../../ui'
import { BagikanRoom } from './BagikanRoom'
import { DaftarPeserta } from './DaftarPeserta'
import { bacaIdentitas } from './identitas'

type Props = {
  kode: string
  keBeranda: () => void
}

const PESAN_GALAT = {
  ROOM_TIDAK_ADA: {
    judul: 'Room tidak ditemukan',
    isi: 'Cek lagi link-nya, atau minta temanmu mengirim ulang link dari room-nya.',
  },
  ROOM_KEDALUWARSA: {
    judul: 'Room ini sudah berakhir',
    isi: 'Room hanya aktif 24 jam supaya lokasi teman-teman tidak tersimpan lama. Buat room baru untuk ketemuan berikutnya.',
  },
} as const

/** Jam sekarang yang diperbarui tiap menit, untuk hitung mundur umur room. */
function useSekarang() {
  const [sekarang, setSekarang] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setSekarang(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return sekarang
}

export function LayarRoom({ kode, keBeranda }: Props) {
  const hasil = useQuery(api.room.lihat, { kode })
  const [identitas] = useState(() => bacaIdentitas(kode))
  const sekarang = useSekarang()

  useEffect(() => {
    document.title = `Room ${kode} · Tikoem`
    return () => {
      document.title = 'Tikoem'
    }
  }, [kode])

  if (hasil === undefined) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4" aria-busy="true">
        <Pin warna={2} ekspresi="nunggu" ukuran={56} className="motion-safe:animate-bounce" />
        <p className="font-semibold">Membuka room {kode}…</p>
      </main>
    )
  }

  if (!hasil.ok) {
    const pesan = PESAN_GALAT[hasil.galat]
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
        <KartuStiker className="flex flex-col items-start gap-4 p-6">
          <Pin warna={5} ekspresi="kaget" ukuran={56} />
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">{pesan.judul}</h1>
          <p>{pesan.isi}</p>
          <Tombol onClick={keBeranda}>Buat room baru</Tombol>
        </KartuStiker>
      </main>
    )
  }

  const { room, peserta } = hasil
  const saya = peserta.find((p) => p.id === identitas?.pesertaId) ?? null

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-7 px-4 pt-6 pb-16">
      <header className="flex flex-col gap-4">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            keBeranda()
          }}
          className="flex items-center gap-2 self-start rounded-lg no-underline focus-visible:outline-3 focus-visible:outline-pin-2"
        >
          <Pin warna={1} ukuran={22} />
          <span className="font-display text-xl font-extrabold tracking-[-0.04em]">Tikoem</span>
        </a>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-teks-redup">Kode room</p>
          <h1 className="font-display text-5xl font-extrabold tracking-[0.04em] tabular-nums [font-variation-settings:'opsz'_96]">
            {room.kode}
          </h1>
          <p className="text-sm text-teks-redup">Room berakhir {sisaWaktu(room.kedaluwarsaPada - sekarang)}.</p>
        </div>
      </header>

      {!saya && (
        <KartuStiker className="flex items-center gap-3 p-4">
          <Pin warna={4} ekspresi="nunggu" ukuran={32} />
          <p className="text-sm">
            <span className="font-bold">Kamu belum gabung room ini.</span> Form gabung (nama, lokasi, dan kendaraan) sedang dibuat.
          </p>
        </KartuStiker>
      )}

      <BagikanRoom kode={room.kode} sendirian={peserta.length === 1} />

      <DaftarPeserta peserta={peserta} idSaya={saya?.id ?? null} />
    </main>
  )
}
