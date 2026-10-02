import { useCallback, useEffect, useState } from 'react'
import { bacaRute, jalurRoom } from '../domain/rute'
import { LayarBuatRoom } from '../features/buat-room/LayarBuatRoom'
import { LayarRoom } from '../features/room/LayarRoom'

/** Rute tanpa library: cukup dua halaman, beranda dan `/r/KODE`. */
function useRute() {
  const [rute, setRute] = useState(() => bacaRute(window.location.pathname))

  useEffect(() => {
    const ikutiBrowser = () => setRute(bacaRute(window.location.pathname))
    window.addEventListener('popstate', ikutiBrowser)
    return () => window.removeEventListener('popstate', ikutiBrowser)
  }, [])

  // Kode dari link yang diketik huruf kecil ditulis ulang jadi bentuk bakunya, supaya link yang dibagikan seragam.
  useEffect(() => {
    if (rute.nama === 'room' && window.location.pathname !== jalurRoom(rute.kode)) {
      window.history.replaceState(null, '', jalurRoom(rute.kode))
    }
  }, [rute])

  const pindah = useCallback((jalur: string) => {
    window.history.pushState(null, '', jalur)
    setRute(bacaRute(jalur))
    window.scrollTo(0, 0)
  }, [])

  return [rute, pindah] as const
}

export default function App() {
  const [rute, pindah] = useRute()

  if (rute.nama === 'room') {
    return <LayarRoom key={rute.kode} kode={rute.kode} keBeranda={() => pindah('/')} />
  }
  return <LayarBuatRoom onDibuat={(kode) => pindah(jalurRoom(kode))} />
}
