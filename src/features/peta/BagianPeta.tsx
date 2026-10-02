import { Component, lazy, Suspense, type ReactNode } from 'react'
import { titikTengah } from '../../domain/titikTengah'
import { formatJarak } from '../../lib/teks'
import { KartuStiker, Pin } from '../../ui'
import type { PinPeta } from './PetaLive'

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

type Props = { pin: PinPeta[] }

export function BagianPeta({ pin }: Props) {
  const perkiraan = pin.length >= 2 ? titikTengah(pin.map((p) => p.lokasi)) : null

  return (
    <section aria-labelledby="peta-judul" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="peta-judul" className="font-display text-xl font-extrabold tracking-[-0.03em]">
          Peta teman
        </h2>
        <p className="text-sm text-teks-redup">
          {perkiraan
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
              <PetaLive pin={pin} tengah={perkiraan?.titik ?? null} />
            </Suspense>
          </PenahanGalat>
        )}
      </KartuStiker>
    </section>
  )
}
