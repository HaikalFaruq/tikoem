import { useEffect, useRef, useState } from 'react'
import { Map as PetaMapLibre, NavigationControl } from 'maplibre-gl'
import type { Titik } from '../../domain/lokasi'
import { Pin, type AksesoriPin, type WarnaPin } from '../../ui'
import { GAYA_PETA, JAKARTA } from './maplibre'

type Props = {
  /** Titik awal di tengah peta. `null` berarti mulai dari Jakarta dengan zoom kota. */
  awal: Titik | null
  pin: { warna: WarnaPin; aksesori: AksesoriPin }
  /** Dipanggil sekali di awal, lalu setiap peta berhenti digeser, dengan titik di ujung pin. */
  onBerhenti: (titik: Titik) => void
  onMulaiGeser: () => void
}

/**
 * Peta untuk memilih titik (#53): pin diam di tengah, petanya yang digeser. Pin terangkat selama peta digeser,
 * lalu turun lagi saat dilepas. Titiknya tidak disimpan di sini, langsung diteruskan ke pemanggil.
 */
export default function PetaPilih({ awal, pin, onBerhenti, onMulaiGeser }: Props) {
  const wadah = useRef<HTMLElement>(null)
  const [bergerak, setBergerak] = useState(false)
  const [tanpaWebGL, setTanpaWebGL] = useState(false)
  const [petaDasarGagal, setPetaDasarGagal] = useState(false)
  // Lewat ref supaya peta tidak dibuat ulang saat pemanggil memberi fungsi baru.
  const berhenti = useRef(onBerhenti)
  const mulai = useRef(onMulaiGeser)
  useEffect(() => {
    berhenti.current = onBerhenti
    mulai.current = onMulaiGeser
  })
  // Peta dibuat sekali, dari titik awal saat dibuka.
  const titikAwal = useRef(awal)

  useEffect(() => {
    const gelap = window.matchMedia('(prefers-color-scheme: dark)')
    const awalPeta = titikAwal.current
    let m: PetaMapLibre
    try {
      m = new PetaMapLibre({
        container: wadah.current!,
        style: gelap.matches ? GAYA_PETA.gelap : GAYA_PETA.terang,
        center: awalPeta ? [awalPeta.lng, awalPeta.lat] : JAKARTA,
        // Zoom jalan kalau sudah ada titik awal, karena lokasinya dipilih sampai tingkat gedung.
        zoom: awalPeta ? 15 : 11,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      })
    } catch {
      // Dukungan WebGL baru ketahuan saat peta dibuat, jadi keadaan ini memang dari effect.
      // eslint-disable-next-line react/set-state-in-effect
      setTanpaWebGL(true)
      return
    }
    m.touchZoomRotate.disableRotation()
    m.keyboard.disableRotation()
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.on('style.load', () => setPetaDasarGagal(false))
    m.on('error', () => {
      if (!m.isStyleLoaded()) setPetaDasarGagal(true)
    })
    m.once('load', () => wadah.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
    m.on('movestart', () => {
      setBergerak(true)
      mulai.current()
    })
    m.on('moveend', () => {
      setBergerak(false)
      const { lat, lng } = m.getCenter()
      berhenti.current({ lat, lng })
    })
    const { lat, lng } = m.getCenter()
    berhenti.current({ lat, lng })

    const gantiTema = () => m.setStyle(gelap.matches ? GAYA_PETA.gelap : GAYA_PETA.terang)
    gelap.addEventListener('change', gantiTema)
    return () => {
      gelap.removeEventListener('change', gantiTema)
      m.remove()
    }
  }, [])

  if (tanpaWebGL) {
    return (
      <div className="grid h-80 place-items-center p-6 text-center text-sm text-teks-redup">
        Peta tidak bisa ditampilkan di browser ini. Pakai GPS atau ketik alamat.
      </div>
    )
  }

  return (
    <div className="relative h-80 w-full bg-kertas" data-peta-pilih={bergerak ? 'bergerak' : 'diam'}>
      <section
        ref={wadah}
        className="h-full w-full"
        aria-label="Peta untuk memilih lokasimu. Geser peta, atau pakai tombol panah setelah peta difokus, sampai ujung pin tepat di lokasimu."
      />
      {petaDasarGagal && (
        <p className="absolute inset-x-3 top-3 rounded-xl border-2 border-garis bg-kartu px-3 py-2 text-xs font-semibold">
          Peta dasar belum termuat. Cek koneksi internetmu.
        </p>
      )}
      {/* Pin di tengah peta: ujungnya tepat di titik yang dipilih. Bayangan di bawahnya menandai titiknya saat pin terangkat. */}
      <div className="pointer-events-none absolute top-1/2 left-1/2" aria-hidden>
        <span className="absolute -top-1 -left-2 h-2 w-4 rounded-full bg-garis/40" />
        <span
          className={`absolute bottom-0 left-0 block -translate-x-1/2 transition-transform duration-300 ease-pegas motion-reduce:transition-none ${
            bergerak ? '-translate-y-3' : 'translate-y-0'
          }`}
        >
          <Pin {...pin} ekspresi={bergerak ? 'nunggu' : 'senang'} ukuran={44} />
        </span>
      </div>
    </div>
  )
}
