import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { labelKendaraan } from '../../domain/kendaraan'
import { MAKS_PESERTA } from '../../domain/room'
import { warnaPin } from '../../domain/warnaPin'
import { Pin } from '../../ui'

type HasilLihat = FunctionReturnType<typeof api.room.lihat>
export type Peserta = Extract<HasilLihat, { ok: true }>['peserta'][number]

type Props = { peserta: Peserta[]; idSaya: string | null }

/** Teman yang sudah gabung, realtime. Pin baru jatuh ke daftar saat orangnya masuk. */
export function DaftarPeserta({ peserta, idSaya }: Props) {
  const sudahLokasi = peserta.filter((p) => p.lokasi).length
  return (
    <section aria-labelledby="peserta-judul" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="peserta-judul" className="font-display text-xl font-extrabold tracking-[-0.03em]">
          Yang sudah gabung
        </h2>
        <p className="text-sm text-teks-redup tabular-nums">
          {peserta.length} dari {MAKS_PESERTA} orang · {sudahLokasi} berbagi lokasi
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {peserta.map((p) => {
          const saya = p.id === idSaya
          return (
            <li
              key={p.id}
              data-urutan={p.urutanGabung}
              className="flex min-w-0 items-center gap-3 rounded-2xl border-[2.5px] border-garis bg-kartu px-3 py-2"
            >
              <Pin
                {...warnaPin(p.urutanGabung)}
                ekspresi={p.lokasi ? 'senang' : 'nunggu'}
                ukuran={30}
                className="animate-jatuh origin-bottom motion-reduce:animate-none"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold">
                  {p.nama}
                  {saya && <span className="font-semibold text-teks-redup"> · kamu</span>}
                </span>
                <span className="truncate text-sm text-teks-redup">
                  {labelKendaraan(p.kendaraan)} · {p.lokasi ? 'lokasi sudah masuk' : 'belum berbagi lokasi'}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
