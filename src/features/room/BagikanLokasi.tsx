import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import type { Titik } from '../../domain/lokasi'
import { pesanGalatGeolokasi } from '../../lib/geolokasi'
import { KartuStiker, Pin, Tombol, type AksesoriPin, type WarnaPin } from '../../ui'
import { PilihDiPeta } from '../peta/PilihDiPeta'
import { CariAlamat } from './CariAlamat'
import type { IdentitasRoom } from './identitas'

type Props = {
  identitas: IdentitasRoom
  sudahAda: boolean
  pin: { warna: WarnaPin; aksesori: AksesoriPin }
  /** Titik awal peta "pilih di peta" (`titikAwalPilih`). */
  awalPeta: Titik | null
  /** Pencarian terakhir gagal karena lokasiku terlalu jauh dari jalan (LOKASI_TIDAK_TERJANGKAU). */
  tidakTerjangkau: boolean
  /** `room.putaranHitung`, supaya peringatan lokasi jauh hilang setelah lokasinya diperbarui dan muncul lagi kalau masih gagal. */
  putaranHitung: number
  /** Dipanggil kalau backend tidak mengenali identitas ini lagi, misalnya orangnya sudah keluar room. */
  onIdentitasHilang: () => void
}

type Posisi = Titik

/** Cara lain selain GPS yang sedang dibuka. */
type Cara = 'alamat' | 'peta' | null

/** Koordinat dari GPS HP. Tidak pernah ditulis ke log atau localStorage: langsung dikirim, lalu disamarkan backend. */
function ambilPosisi(): Promise<Posisi> {
  return new Promise((selesai, gagal) => {
    if (!('geolocation' in navigator)) {
      gagal({ code: 0 })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (posisi) => selesai({ lat: posisi.coords.latitude, lng: posisi.coords.longitude }),
      gagal,
      // Ketelitian tinggi tidak perlu karena lokasi disamarkan ~110 m. Posisi dari satu menit terakhir boleh dipakai ulang.
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    )
  })
}

export function BagikanLokasi({ identitas, sudahAda, pin, awalPeta, tidakTerjangkau, putaranHitung, onIdentitasHilang }: Props) {
  const kirimLokasi = useMutation(api.room.kirimLokasi)
  const [status, setStatus] = useState<'diam' | 'mencari' | 'menyimpan'>('diam')
  const [galat, setGalat] = useState<string | null>(null)
  const [cara, setCara] = useState<Cara>(null)
  const [putaranDiperbarui, setPutaranDiperbarui] = useState<number | null>(null)
  const lokasiJauh = tidakTerjangkau && putaranDiperbarui !== putaranHitung

  /** Dipakai GPS, alamat, maupun peta. Backend yang menyamarkan lokasinya. */
  async function simpan(posisi: Posisi) {
    setGalat(null)
    setStatus('menyimpan')
    try {
      await kirimLokasi({ ...identitas, lokasi: posisi })
      setCara(null)
      setPutaranDiperbarui(putaranHitung)
    } catch (e) {
      const kode = e instanceof ConvexError ? (e.data as { galat?: string } | undefined)?.galat : undefined
      if (kode === 'PESERTA_TIDAK_DIKENAL') return onIdentitasHilang()
      setGalat(
        kode === 'LOKASI_TIDAK_VALID'
          ? 'Lokasi yang terbaca tidak masuk akal. Coba lagi.'
          : 'Lokasimu belum tersimpan. Cek koneksi internetmu, lalu coba lagi.',
      )
    } finally {
      setStatus('diam')
    }
  }

  async function pakaiGps() {
    setGalat(null)
    setStatus('mencari')
    let posisi: Posisi
    try {
      posisi = await ambilPosisi()
    } catch (e) {
      setStatus('diam')
      setGalat(`${pesanGalatGeolokasi((e as { code?: number }).code ?? -1)} Bisa juga ketik alamat di bawah.`)
      setCara('alamat')
      return
    }
    await simpan(posisi)
  }

  const sibuk = status !== 'diam'
  const labelTombol = status === 'mencari' ? 'Mencari lokasimu…' : status === 'menyimpan' ? 'Menyimpan…' : null
  const peta = <PilihDiPeta awal={awalPeta} pin={pin} sibuk={sibuk} onPakai={simpan} onBatal={() => setCara(null)} />

  if (sudahAda) {
    return (
      <KartuStiker as="section" aria-labelledby="lokasi-judul" className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <Pin {...pin} ekspresi={lokasiJauh ? 'kaget' : 'senang'} ukuran={32} />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id="lokasi-judul" className="font-bold">
              {lokasiJauh ? 'Lokasimu terlalu jauh dari jalan' : 'Lokasimu sudah masuk'}
            </h2>
            <p className="text-sm text-teks-redup">
              {lokasiJauh
                ? 'Waktu tempuhnya tidak bisa dihitung. Pilih titik yang dekat jalan, lalu tekan Coba lagi di bagian Cari tempat.'
                : 'Disamarkan sekitar 100 m, jadi rumahmu tidak terlihat persis.'}
            </p>
          </div>
        </div>
        {cara !== 'peta' && (
          <div className="flex flex-wrap gap-2">
            {lokasiJauh && (
              <Tombol onClick={() => setCara('peta')} disabled={sibuk} className="w-full">
                Pilih titik di peta
              </Tombol>
            )}
            <Tombol varian="biasa" onClick={pakaiGps} disabled={sibuk}>
              {labelTombol ?? 'Perbarui lewat GPS'}
            </Tombol>
            {cara !== 'alamat' && (
              <Tombol varian="biasa" onClick={() => setCara('alamat')} disabled={sibuk}>
                Pakai alamat
              </Tombol>
            )}
            {!lokasiJauh && (
              <Tombol varian="biasa" onClick={() => setCara('peta')} disabled={sibuk}>
                Pilih di peta
              </Tombol>
            )}
          </div>
        )}
        {galat && (
          <p role="alert" className="text-sm font-semibold">
            {galat}
          </p>
        )}
        {cara === 'alamat' && <CariAlamat onPilih={simpan} sibuk={sibuk} />}
        {cara === 'peta' && peta}
      </KartuStiker>
    )
  }

  return (
    <KartuStiker as="section" aria-labelledby="lokasi-judul" className="flex min-w-0 flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2.5">
          <Pin {...pin} ekspresi="nunggu" ukuran={30} className="motion-safe:animate-bounce" />
          <h2 id="lokasi-judul" className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Bagikan lokasimu
          </h2>
        </div>
        <p className="text-sm">
          Tempat kumpul dihitung dari lokasi semua orang. Lokasimu <b>disamarkan sekitar 100 m</b> sebelum disimpan, jadi
          rumahmu tidak terlihat persis.
        </p>
      </div>
      <Tombol onClick={pakaiGps} disabled={sibuk} className="w-full">
        {labelTombol ?? 'Pakai lokasiku sekarang'}
      </Tombol>
      {galat && (
        <p role="alert" className="text-sm font-semibold">
          {galat}
        </p>
      )}
      <div className="flex items-center gap-3 text-sm font-semibold text-teks-redup" aria-hidden>
        <span className="h-0.5 flex-1 rounded-full bg-garis/20" />
        atau
        <span className="h-0.5 flex-1 rounded-full bg-garis/20" />
      </div>
      {cara === 'peta' ? (
        peta
      ) : (
        <>
          <CariAlamat onPilih={simpan} sibuk={sibuk} />
          <Tombol varian="biasa" onClick={() => setCara('peta')} disabled={sibuk} className="self-start">
            Pilih titik di peta
          </Tombol>
        </>
      )}
    </KartuStiker>
  )
}
