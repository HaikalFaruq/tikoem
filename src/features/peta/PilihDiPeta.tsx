import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Titik } from '../../domain/lokasi'
import { jedaPermintaan } from '../../lib/waktu'
import { Tombol, type AksesoriPin, type WarnaPin } from '../../ui'

// MapLibre baru diunduh saat orang memilih di peta.
const PetaPilih = lazy(() => import('./PetaPilih'))

/** Alamat dicari setelah peta diam sebentar, bukan setiap peta bergeser sedikit. */
const TUNDA_ALAMAT_MS = 600
/** Nominatim hanya boleh satu permintaan per detik untuk seluruh app (#55). */
const JARAK_MIN_ALAMAT_MS = 1100

type Props = {
  awal: Titik | null
  pin: { warna: WarnaPin; aksesori: AksesoriPin }
  sibuk: boolean
  /** Titik di ujung pin. Pemanggil yang mengirimnya lewat `room.kirimLokasi`, yang menyamarkannya. */
  onPakai: (titik: Titik) => void
  onBatal: () => void
}

type Label = { jenis: 'bergerak' } | { jenis: 'mencari' } | { jenis: 'ada'; teks: string } | { jenis: 'jauh' } | { jenis: 'kosong' }

/** Cara ketiga berbagi lokasi (#53): geser peta sampai pin di lokasimu, lihat alamatnya, lalu pakai titik itu. */
export function PilihDiPeta({ awal, pin, sibuk, onPakai, onBatal }: Props) {
  const alamat = useAction(api.lokasi.alamat)
  const [titik, setTitik] = useState<Titik | null>(null)
  const [label, setLabel] = useState<Label>({ jenis: 'mencari' })
  const terakhirDiminta = useRef<number | null>(null)
  const urutan = useRef(0)

  useEffect(() => {
    if (!titik) return
    const nomor = ++urutan.current
    const jam = window.setTimeout(
      async () => {
        terakhirDiminta.current = Date.now()
        let hasil: Label
        try {
          const jawaban = await alamat({ lokasi: titik })
          hasil = jawaban ? { jenis: 'ada', teks: jawaban.label } : { jenis: 'jauh' }
        } catch {
          // LAYANAN_GAGAL atau antrean Nominatim penuh: labelnya dikosongkan, titiknya tetap boleh dipakai.
          hasil = { jenis: 'kosong' }
        }
        // Jawaban untuk titik lama dibuang kalau peta sudah digeser lagi.
        if (nomor === urutan.current) setLabel(hasil)
      },
      jedaPermintaan(Date.now(), terakhirDiminta.current, JARAK_MIN_ALAMAT_MS, TUNDA_ALAMAT_MS),
    )
    return () => window.clearTimeout(jam)
  }, [titik, alamat])

  const bisaDipakai = titik !== null && label.jenis !== 'bergerak' && label.jenis !== 'jauh' && !sibuk

  return (
    <div className="flex min-w-0 flex-col gap-3" data-pilih-di-peta>
      <p className="text-sm">Geser peta sampai ujung pin tepat di lokasimu. Perbesar petanya supaya lebih tepat.</p>
      <div className="overflow-hidden rounded-2xl border-[2.5px] border-garis">
        <Suspense fallback={<div className="h-80 animate-pulse bg-kertas" aria-label="Memuat peta" />}>
          <PetaPilih
            awal={awal}
            pin={pin}
            onMulaiGeser={() => {
              urutan.current++
              setLabel({ jenis: 'bergerak' })
            }}
            onBerhenti={(t) => {
              setTitik(t)
              setLabel({ jenis: 'mencari' })
            }}
          />
        </Suspense>
      </div>
      <p aria-live="polite" className="min-h-10 text-sm" data-label-titik>
        {label.jenis === 'bergerak' && <span className="text-teks-redup">Lepas peta untuk melihat alamatnya.</span>}
        {label.jenis === 'mencari' && <span className="text-teks-redup">Mencari alamat titik ini…</span>}
        {label.jenis === 'ada' && <b>{label.teks}</b>}
        {label.jenis === 'jauh' && (
          <b>Titik ini jauh dari jalan, misalnya di laut. Geser pin ke dekat jalan supaya waktu tempuhnya bisa dihitung.</b>
        )}
        {label.jenis === 'kosong' && <span className="text-teks-redup">Alamatnya belum bisa ditampilkan, tapi titik ini tetap bisa dipakai.</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Tombol onClick={() => titik && onPakai(titik)} disabled={!bisaDipakai} className="min-w-44 flex-1">
          {sibuk ? 'Menyimpan…' : 'Pakai titik ini'}
        </Tombol>
        <Tombol varian="biasa" onClick={onBatal} disabled={sibuk} className="min-h-11">
          Batal
        </Tombol>
      </div>
      <p className="text-xs text-teks-redup">Sama seperti GPS, titiknya disamarkan sekitar 100 m sebelum disimpan.</p>
    </div>
  )
}
