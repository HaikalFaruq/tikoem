import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { Titik } from '../../domain/lokasi'
import { titikTengah } from '../../domain/titikTengah'
import { pilihanAkhir } from '../../domain/vote'
import { formatJarak } from '../../lib/teks'
import { KartuStiker, Pin } from '../../ui'
import type { KandidatPeta, PinPeta } from './PetaLive'

// MapLibre besar (~1 MB), jadi baru diunduh saat peta pertama kali dibutuhkan, bukan di beranda.
const PetaLive = lazy(() => import('./PetaLive'))

/** Kalau unduhan peta gagal (misalnya offline), bagian lain layar room tetap jalan. */
class PenahanGalat extends Component<{ children: ReactNode }, { gagal: boolean }> {
  state = { gagal: false }
  static getDerivedStateFromError() {
    return { gagal: true }
  }
  render() {
    if (this.state.gagal) {
      return (
        <div className="grid h-72 place-items-center p-6 text-center text-sm text-teks-redup">
          Peta belum bisa dimuat. Cek koneksi internetmu, lalu buka ulang halaman ini.
        </div>
      )
    }
    return this.props.children
  }
}

type KandidatMasuk = Omit<KandidatPeta, 'terpilih'> & { pemilih: readonly unknown[] }

type Props = {
  pin: PinPeta[]
  kandidat: KandidatMasuk[]
  /** Titik tengah yang dipakai backend untuk mencari tempat. Ada setelah tombol Cari tempat ditekan. */
  titikTengahHasil: Titik | null
  menghitung: boolean
}

/** Menggulir ke kartu tempat saat penanda kandidat di peta diketuk. */
function gulirKeKartu(peringkat: number) {
  const kartu = document.querySelector<HTMLElement>(`[data-kandidat="${peringkat}"]`)
  const dikurangi = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  kartu?.scrollIntoView({ behavior: dikurangi ? 'auto' : 'smooth', block: 'center' })
}

export function BagianPeta({ pin, kandidat, titikTengahHasil, menghitung }: Props) {
  const perkiraan = pin.length >= 2 ? titikTengah(pin.map((p) => p.lokasi)) : null
  const idTerpilih = pilihanAkhir(kandidat)
  const kandidatPeta = kandidat.map(({ pemilih: _pemilih, ...k }) => ({ ...k, terpilih: k.id === idTerpilih }))
  const adaHasil = kandidat.length > 0
  const tengah = adaHasil && titikTengahHasil ? titikTengahHasil : (perkiraan?.titik ?? null)

  return (
    <section aria-labelledby="peta-judul" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="peta-judul" className="font-display text-xl font-extrabold tracking-[-0.03em]">
          Peta teman
        </h2>
        <p className="text-sm text-teks-redup">
          {adaHasil
            ? 'Bintang adalah tempat dengan suara terbanyak. Angka adalah peringkat keadilan, ketuk untuk melihat kartunya.'
            : perkiraan
            ? `Cincin kuning adalah perkiraan titik tengah. Orang terjauh ${formatJarak(perkiraan.radiusMeter)} dari situ.`
            : pin.length === 1
              ? 'Titik tengah muncul setelah minimal 2 orang berbagi lokasi.'
              : 'Pin teman muncul di sini setelah mereka berbagi lokasi.'}
        </p>
      </div>
      <KartuStiker className="overflow-hidden p-0">
        {pin.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex items-end gap-1" aria-hidden>
              <Pin warna={1} ekspresi="nunggu" ukuran={28} />
              <Pin warna={2} ekspresi="nunggu" ukuran={34} />
              <Pin warna={3} ekspresi="nunggu" ukuran={28} />
            </div>
            <p className="text-sm font-semibold">Belum ada yang berbagi lokasi.</p>
          </div>
        ) : (
          <PenahanGalat>
            <Suspense fallback={<div className="h-72 animate-pulse bg-kertas" aria-label="Memuat peta" />}>
              <PetaLive
                pin={pin}
                tengah={tengah}
                kandidat={kandidatPeta}
                kandidatRedup={menghitung}
                onPilihKandidat={gulirKeKartu}
              />
            </Suspense>
          </PenahanGalat>
        )}
      </KartuStiker>
    </section>
  )
}
