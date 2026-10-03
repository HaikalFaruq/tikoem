import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Map as PetaMapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Vite mem-bundle worker MapLibre beserta modul bersamanya jadi satu file. Tanpa ini worker-nya hilang setelah build.
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { batasPeta, lingkaranGeo, sebarPinBerdekatan } from '../../domain/peta'
import type { Titik } from '../../domain/lokasi'
import { namaPendek } from '../../lib/teks'
import { Bintang, Pin, type AksesoriPin, type WarnaPin } from '../../ui'

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

export type KandidatPeta = {
  id: string
  nama: string
  lokasi: Titik
  peringkat: number
  /** Suara terbanyak saat ini (pilihanAkhir). Digambar sebagai bintang tempat kumpul. */
  terpilih: boolean
}

type Props = {
  pin: PinPeta[]
  tengah: Titik | null
  kandidat: KandidatPeta[]
  /** Selama hitung ulang, kandidat lama tetap tampil tapi redup. */
  kandidatRedup: boolean
  /** Dipanggil saat penanda kandidat diketuk, untuk menggulir ke kartu tempatnya. */
  onPilihKandidat: (peringkat: number) => void
}

type Penanda = { marker: Marker; el: HTMLDivElement }

const geraknyaDikurangi = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function PetaLive({ pin, tengah, kandidat, kandidatRedup, onPilihKandidat }: Props) {
  const wadah = useRef<HTMLDivElement>(null)
  const peta = useRef<PetaMapLibre | null>(null)
  const penandaPin = useRef(new Map<string, Penanda>())
  const penandaTengah = useRef<Penanda | null>(null)
  const pinTerakhir = useRef<PinPeta[]>([])
  const penandaKandidat = useRef(new Map<string, Penanda>())
  const kandidatTerakhir = useRef<KandidatPeta[]>([])
  const sebarSemua = (m: PetaMapLibre) =>
    aturSebaran(m, [
      { isi: kandidatTerakhir.current, penanda: penandaKandidat.current },
      { isi: pinTerakhir.current, penanda: penandaPin.current },
    ])
  const [elemenPin, setElemenPin] = useState<{ id: string; el: HTMLDivElement }[]>([])
  const [elemenKandidat, setElemenKandidat] = useState<{ id: string; el: HTMLDivElement }[]>([])
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
    m.on('zoom', () => sebarSemua(m))
    // Atribusi OpenFreeMap dan OpenStreetMap tetap ada di tombol (i), tapi tidak menutupi peta saat dibuka.
    m.once('load', () => wadah.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
    peta.current = m

    const gantiTema = () => m.setStyle(gelap.matches ? GAYA_PETA.gelap : GAYA_PETA.terang)
    gelap.addEventListener('change', gantiTema)
    const semuaPenanda = penandaPin.current
    const semuaKandidat = penandaKandidat.current
    return () => {
      gelap.removeEventListener('change', gantiTema)
      m.remove()
      peta.current = null
      semuaPenanda.clear()
      semuaKandidat.clear()
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
    sebarSemua(m)
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

  // Kandidat tempat: angka peringkat, dan bintang untuk suara terbanyak. Bintang paling atas supaya tidak tertutup.
  useEffect(() => {
    const m = peta.current
    if (!m) return
    const ada = penandaKandidat.current
    const idSekarang = new Set(kandidat.map((k) => k.id))
    for (const [id, { marker }] of ada) {
      if (!idSekarang.has(id)) {
        marker.remove()
        ada.delete(id)
      }
    }
    for (const k of kandidat) {
      let penanda = ada.get(k.id)
      if (!penanda) {
        const el = document.createElement('div')
        penanda = { el, marker: new Marker({ element: el, anchor: 'bottom' }).setLngLat([k.lokasi.lng, k.lokasi.lat]).addTo(m) }
        ada.set(k.id, penanda)
      }
      penanda.marker.setLngLat([k.lokasi.lng, k.lokasi.lat])
      // Setelah hasil keluar, kandidat lebih penting untuk diketuk daripada pin teman, jadi berada di atasnya.
      penanda.el.style.zIndex = k.terpilih ? '6' : '5'
    }
    kandidatTerakhir.current = kandidat
    sebarSemua(m)
    setElemenKandidat(kandidat.map((k) => ({ id: k.id, el: ada.get(k.id)!.el })))
  }, [kandidat])

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
  // Kandidat ikut menentukan kamera, supaya semua tempat dan semua teman terlihat setelah hasil keluar.
  const kunciBatas = [...pin.map((p) => p.id), ...kandidat.map((k) => k.id)].join('|')
  useEffect(() => {
    const m = peta.current
    const batas = batasPeta([...pin.map((p) => p.lokasi), ...kandidat.map((k) => k.lokasi), ...(tengah ? [tengah] : [])])
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
      {elemenKandidat.map(({ id, el }) => {
        const k = kandidat.find((x) => x.id === id)
        return k ? createPortal(<PenandaKandidat kandidat={k} redup={kandidatRedup} onPilih={onPilihKandidat} />, el, id) : null
      })}
    </div>
  )
}

/**
 * Pin teman dan kandidat yang di layar terlalu berdekatan disebar bersama, supaya tidak ada yang tertutup dan semuanya bisa diketuk.
 * Kandidat sering berdekatan (beberapa kafe di satu ruas jalan) dan sering dekat dengan teman yang tinggal di dekat titik tengah.
 */
function aturSebaran(m: PetaMapLibre, kelompok: readonly { isi: readonly { id: string; lokasi: Titik }[]; penanda: Map<string, Penanda> }[]) {
  const semua = kelompok.flatMap(({ isi, penanda }) => isi.map((x) => ({ ...x, penanda })))
  const geser = sebarPinBerdekatan(
    semua.map((x) => m.project([x.lokasi.lng, x.lokasi.lat])),
    34,
    26,
  )
  semua.forEach((x, i) => x.penanda.get(x.id)?.marker.setOffset([geser[i].x, geser[i].y]))
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

function PenandaKandidat({ kandidat, redup, onPilih }: { kandidat: KandidatPeta; redup: boolean; onPilih: (peringkat: number) => void }) {
  const label = `${kandidat.nama}, peringkat ${kandidat.peringkat}${kandidat.terpilih ? ', suara terbanyak' : ''}`
  return (
    <button
      type="button"
      aria-label={label}
      title={kandidat.nama}
      onClick={() => onPilih(kandidat.peringkat)}
      data-kandidat-peta={kandidat.peringkat}
      {...(kandidat.terpilih ? { 'data-pilihan-peta': '' } : {})}
      className={`flex cursor-pointer flex-col items-center transition-opacity focus-visible:outline-3 focus-visible:outline-pin-2 ${redup ? 'opacity-40' : ''}`}
    >
      {kandidat.terpilih ? (
        <>
          <span className="mb-0.5 max-w-36 truncate rounded-full border-2 border-garis bg-bintang px-1.5 text-[11px] leading-4 font-extrabold text-tinta">
            {kandidat.nama}
          </span>
          <Bintang ukuran={34} className="animate-jatuh origin-bottom motion-reduce:animate-none" />
        </>
      ) : (
        <span className="grid size-7 place-items-center rounded-full border-[2.5px] border-garis bg-kartu text-xs font-extrabold text-teks shadow-stiker-kecil">
          {kandidat.peringkat}
        </span>
      )}
    </button>
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
