import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Map as PetaMapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Vite mem-bundle worker MapLibre beserta modul bersamanya jadi satu file. Tanpa ini worker-nya hilang setelah build.
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { batasPeta, lingkaranGeo, sebarPinBerdekatan } from '../../domain/peta'
import type { Titik } from '../../domain/lokasi'
import { namaPendek } from '../../lib/teks'
import { Pin, type AksesoriPin, type WarnaPin } from '../../ui'

setWorkerUrl(urlWorker)

/** Peta dasar OpenFreeMap: gratis, tanpa API key. Positron tenang supaya pin stiker yang menonjol. */
const GAYA_PETA = {
  terang: 'https://tiles.openfreemap.org/styles/positron',
  gelap: 'https://tiles.openfreemap.org/styles/dark',
}
const JAKARTA: [number, number] = [106.8456, -6.2088]
/** Sama dengan presisi penyamaran di src/domain/lokasi.ts. */
const RADIUS_SAMAR_METER = 110

export type PinPeta = {
  id: string
  nama: string
  lokasi: Titik
  warna: WarnaPin
  aksesori: AksesoriPin
  saya: boolean
}

type Props = {
  pin: PinPeta[]
  tengah: Titik | null
}

type Penanda = { marker: Marker; el: HTMLDivElement }

const geraknyaDikurangi = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function PetaLive({ pin, tengah }: Props) {
  const wadah = useRef<HTMLDivElement>(null)
  const peta = useRef<PetaMapLibre | null>(null)
  const penandaPin = useRef(new Map<string, Penanda>())
  const penandaTengah = useRef<Penanda | null>(null)
  const pinTerakhir = useRef<PinPeta[]>([])
  const [elemenPin, setElemenPin] = useState<{ id: string; el: HTMLDivElement }[]>([])
  const [elemenTengah, setElemenTengah] = useState<HTMLDivElement | null>(null)
  const [versiGaya, setVersiGaya] = useState(0)
  const [tanpaWebGL, setTanpaWebGL] = useState(false)
  const [petaDasarGagal, setPetaDasarGagal] = useState(false)

  // Peta dibuat sekali. Ganti tema hanya mengganti gaya peta dasar.
  useEffect(() => {
    const gelap = window.matchMedia('(prefers-color-scheme: dark)')
    let m: PetaMapLibre
    try {
      m = new PetaMapLibre({
        container: wadah.current!,
        style: gelap.matches ? GAYA_PETA.gelap : GAYA_PETA.terang,
        center: JAKARTA,
        zoom: 11,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      })
    } catch {
      setTanpaWebGL(true)
      return
    }
    m.touchZoomRotate.disableRotation()
    m.keyboard.disableRotation()
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.on('style.load', () => {
      setPetaDasarGagal(false)
      setVersiGaya((v) => v + 1)
    })
    m.on('error', () => {
      if (!m.isStyleLoaded()) setPetaDasarGagal(true)
    })
    // Jarak antarpin di layar berubah setiap zoom, jadi sebaran pin dihitung ulang.
    m.on('zoom', () => aturSebaranPin(m, pinTerakhir.current, penandaPin.current))
    // Atribusi OpenFreeMap dan OpenStreetMap tetap ada di tombol (i), tapi tidak menutupi peta saat dibuka.
    m.once('load', () => wadah.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
    peta.current = m

    const gantiTema = () => m.setStyle(gelap.matches ? GAYA_PETA.gelap : GAYA_PETA.terang)
    gelap.addEventListener('change', gantiTema)
    const semuaPenanda = penandaPin.current
    return () => {
      gelap.removeEventListener('change', gantiTema)
      m.remove()
      peta.current = null
      semuaPenanda.clear()
      penandaTengah.current = null
    }
  }, [])

  // Pin teman: dibuat, dipindah, atau dihapus mengikuti data realtime. Isinya digambar React lewat portal.
  useEffect(() => {
    const m = peta.current
    if (!m) return
    const ada = penandaPin.current
    const idSekarang = new Set(pin.map((p) => p.id))
    for (const [id, { marker }] of ada) {
      if (!idSekarang.has(id)) {
        marker.remove()
        ada.delete(id)
      }
    }
    pin.forEach((p) => {
      let penanda = ada.get(p.id)
      if (!penanda) {
        const el = document.createElement('div')
        penanda = { el, marker: new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lokasi.lng, p.lokasi.lat]).addTo(m) }
        ada.set(p.id, penanda)
      }
      penanda.marker.setLngLat([p.lokasi.lng, p.lokasi.lat])
      penanda.el.style.zIndex = p.saya ? '3' : '2'
    })
    pinTerakhir.current = pin
    aturSebaranPin(m, pin, ada)
    setElemenPin(pin.map((p) => ({ id: p.id, el: ada.get(p.id)!.el })))
  }, [pin])

  // Perkiraan titik tengah: cincin putus-putus, bukan bintang. Bintang khusus untuk tempat kumpul yang sudah terpilih.
  useEffect(() => {
    const m = peta.current
    if (!m) return
    if (!tengah) {
      penandaTengah.current?.marker.remove()
      penandaTengah.current = null
      setElemenTengah(null)
      return
    }
    if (!penandaTengah.current) {
      const el = document.createElement('div')
      el.style.zIndex = '1'
      // Koordinat harus diisi sebelum addTo, kalau tidak MapLibre melempar galat saat menggambar penanda.
      const marker = new Marker({ element: el, anchor: 'center' }).setLngLat([tengah.lng, tengah.lat]).addTo(m)
      penandaTengah.current = { el, marker }
      setElemenTengah(el)
    }
    penandaTengah.current.marker.setLngLat([tengah.lng, tengah.lat])
  }, [tengah])

  // Lingkaran samar di lokasi sendiri: jujur bahwa titik itu hanya perkiraan ~110 m. Dipasang ulang setiap gaya peta berganti.
  const saya = pin.find((p) => p.saya)
  const kunciSaya = saya ? `${saya.lokasi.lat},${saya.lokasi.lng},${saya.warna}` : ''
  useEffect(() => {
    const m = peta.current
    if (!m || versiGaya === 0) return
    const sumber = m.getSource<GeoJSONSource>('samar-saya')
    if (!saya) {
      if (m.getLayer('samar-saya-isi')) m.removeLayer('samar-saya-isi')
      if (m.getLayer('samar-saya-garis')) m.removeLayer('samar-saya-garis')
      if (sumber) m.removeSource('samar-saya')
      return
    }
    const data: Parameters<GeoJSONSource['setData']>[0] = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [lingkaranGeo(saya.lokasi, RADIUS_SAMAR_METER)] },
    }
    if (sumber) {
      sumber.setData(data)
      return
    }
    const warna = getComputedStyle(document.documentElement).getPropertyValue(`--color-pin-${saya.warna}`).trim() || '#3D7BFF'
    m.addSource('samar-saya', { type: 'geojson', data })
    m.addLayer({ id: 'samar-saya-isi', type: 'fill', source: 'samar-saya', paint: { 'fill-color': warna, 'fill-opacity': 0.18 } })
    m.addLayer({
      id: 'samar-saya-garis',
      type: 'line',
      source: 'samar-saya',
      paint: { 'line-color': warna, 'line-width': 2, 'line-dasharray': [2, 2] },
    })
    // kunciSaya mewakili isi `saya` yang relevan, supaya efek tidak jalan di setiap render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciSaya, versiGaya])

  // Kamera hanya menyesuaikan saat ada orang yang baru berbagi lokasi atau berhenti, bukan setiap data berubah.
  const kunciBatas = pin.map((p) => p.id).join('|')
  useEffect(() => {
    const m = peta.current
    const batas = batasPeta([...pin.map((p) => p.lokasi), ...(tengah ? [tengah] : [])])
    if (!m || !batas) return
    m.fitBounds(batas, {
      padding: { top: 72, bottom: 48, left: 48, right: 48 },
      maxZoom: 15,
      duration: geraknyaDikurangi() ? 0 : 700,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciBatas])

  if (tanpaWebGL) {
    return (
      <div className="grid h-72 place-items-center p-6 text-center text-sm text-teks-redup">
        Peta tidak bisa ditampilkan di browser ini. Daftar teman di bawah tetap terbarui.
      </div>
    )
  }

  return (
    <div className="relative h-72 w-full bg-kertas" data-peta-live>
      {/* Ukuran lewat h-full, bukan absolute: CSS MapLibre memaksa .maplibregl-map jadi position: relative. */}
      <div ref={wadah} className="h-full w-full" />
      {petaDasarGagal && (
        <p className="absolute inset-x-3 top-3 rounded-xl border-2 border-garis bg-kartu px-3 py-2 text-xs font-semibold">
          Peta dasar belum termuat. Pin teman tetap ditampilkan.
        </p>
      )}
      {elemenPin.map(({ id, el }) => {
        const p = pin.find((x) => x.id === id)
        return p ? createPortal(<PinDiPeta pin={p} />, el, id) : null
      })}
      {elemenTengah && tengah && createPortal(<PenandaTengah />, elemenTengah)}
    </div>
  )
}

/** Pin yang di layar terlalu berdekatan disebar sedikit, supaya semua teman terlihat. */
function aturSebaranPin(m: PetaMapLibre, pin: readonly PinPeta[], penanda: Map<string, Penanda>) {
  const geser = sebarPinBerdekatan(pin.map((p) => m.project([p.lokasi.lng, p.lokasi.lat])))
  pin.forEach((p, i) => penanda.get(p.id)?.marker.setOffset([geser[i].x, geser[i].y]))
}

function PinDiPeta({ pin }: { pin: PinPeta }) {
  return (
    <div className="flex flex-col items-center" data-pin-peta={pin.id}>
      <span className="mb-0.5 rounded-full border-2 border-garis bg-kartu px-1.5 text-[11px] leading-4 font-bold whitespace-nowrap text-teks">
        {pin.saya ? 'Kamu' : namaPendek(pin.nama)}
      </span>
      <Pin
        warna={pin.warna}
        aksesori={pin.aksesori}
        ukuran={30}
        className="animate-jatuh origin-bottom drop-shadow-[2px_2px_0_var(--color-bayangan)] motion-reduce:animate-none"
      />
    </div>
  )
}

function PenandaTengah() {
  return (
    <div className="relative grid size-12 place-items-center" data-titik-tengah>
      <span className="absolute inset-0 rounded-full border-3 border-dashed border-garis bg-bintang/30 motion-safe:animate-denyut" />
      <span className="size-2.5 rounded-full border-2 border-garis bg-bintang" />
    </div>
  )
}
