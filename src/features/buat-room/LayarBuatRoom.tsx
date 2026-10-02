import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { IlustrasiKumpul, KartuStiker, Pin } from '../../ui'
import { FormPeserta } from '../peserta/FormPeserta'
import { simpanIdentitas } from '../room/identitas'

type Props = {
  /** Dipanggil setelah room jadi dan identitas pembuatnya tersimpan. */
  onDibuat: (kode: string) => void
}

export function LayarBuatRoom({ onDibuat }: Props) {
  const buat = useMutation(api.room.buat)

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
        <FormPeserta
          labelTombol="Buat room"
          labelMengirim="Membuat room…"
          onKirim={async (data) => {
            const { kode, pesertaId, kunci } = await buat(data)
            simpanIdentitas(kode, { pesertaId, kunci })
            onDibuat(kode)
          }}
        />
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
