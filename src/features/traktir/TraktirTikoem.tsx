import { useEffect, useRef, useState } from 'react'
import { LINK_TRAKTIR, waktunyaTraktir } from '../../domain/traktir'
import { warnaPin } from '../../domain/warnaPin'
import { Bintang, DialogStiker, IlustrasiTraktir, Pin, TautanTombol, Tombol } from '../../ui'
import type { Peserta, Room } from '../hasil/tipe'

type Props = {
  room: Pick<Room, 'kode' | 'status' | 'putaranHitung'>
  peserta: Peserta[]
  /** Kartu ajakannya baru tampil setelah hasil keluar, saat orang sudah merasakan manfaatnya (#65). Pop up tetap bisa muncul sebelumnya. */
  tampilkanKartu: boolean
}

/** Pop up dibuka sendiri saat tempat mulai dicari, atau lewat tombol "Traktir Tikoem" di bawah layar room. */
type Asal = 'pencarian' | 'tombol'

const kunciTraktir = (kode: string) => `tikoem:traktir:${kode}`

function bacaSudahMuncul(kode: string) {
  try {
    return localStorage.getItem(kunciTraktir(kode)) !== null
  } catch {
    return false
  }
}

function tandaiSudahMuncul(kode: string) {
  try {
    localStorage.setItem(kunciTraktir(kode), '1')
  } catch {
    // Tanpa localStorage, pop up bisa muncul lagi kalau halaman dibuka ulang di tengah pencarian. Tidak apa-apa.
  }
}

function StatusPencarian({ status, peserta }: { status: Room['status']; peserta: Peserta[] }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border-2 border-garis bg-kertas px-3 py-2.5 text-left">
      {status === 'menghitung' && (
        <span className="flex shrink-0 items-end -space-x-1" aria-hidden>
          {peserta
            .filter((p) => p.lokasi)
            .slice(0, 3)
            .map((p, i) => (
              <span key={p.id} className="motion-safe:animate-bounce" style={{ animationDelay: `${i * 120}ms` }}>
                <Pin {...warnaPin(p.urutanGabung)} ekspresi="nunggu" ukuran={18} />
              </span>
            ))}
        </span>
      )}
      {status === 'siap' && <Bintang ukuran={24} />}
      <p aria-live="polite" className="text-sm font-semibold">
        {status === 'menghitung' && 'Tikoem sedang mencari tempat paling adil…'}
        {status === 'siap' && 'Tempatnya sudah ketemu!'}
        {status === 'gagal' && 'Tempatnya belum berhasil dicari. Cek pesannya di room.'}
      </p>
    </div>
  )
}

/**
 * Ajakan traktir Tikoem lewat Sociabuzz. Pop up-nya muncul di semua HP di room saat tempat mulai dicari, sekali per room
 * (src/domain/traktir.ts), dan bisa dibuka lagi kapan saja lewat tombol di bawah layar room.
 */
export function TraktirTikoem({ room, peserta, tampilkanKartu }: Props) {
  const [terbuka, setTerbuka] = useState<Asal | null>(null)
  const [putaranAwal] = useState(room.putaranHitung)
  const [sudahMuncul, setSudahMuncul] = useState(() => bacaSudahMuncul(room.kode))
  const keHasilSetelahTutup = useRef(false)

  // Dibuka langsung saat render, tanpa menunggu effect. Render berikutnya `sudahMuncul` sudah true, jadi hanya sekali.
  if (waktunyaTraktir({ menghitung: room.status === 'menghitung', putaran: room.putaranHitung, putaranAwal, sudahMuncul })) {
    setSudahMuncul(true)
    setTerbuka('pencarian')
  }
  useEffect(() => {
    if (sudahMuncul) tandaiSudahMuncul(room.kode)
  }, [sudahMuncul, room.kode])

  function tutup() {
    setTerbuka(null)
    // Digulir setelah dialog benar-benar tertutup, karena browser mengembalikan fokus (dan guliran) ke tempat semula.
    if (keHasilSetelahTutup.current) {
      keHasilSetelahTutup.current = false
      const pelan = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Judul bagian "Cari tempat" di BagianHasil, tempat hasil atau pesan gagalnya tampil.
      document.getElementById('hasil-judul')?.scrollIntoView({ behavior: pelan ? 'smooth' : 'auto', block: 'start' })
    }
  }

  function keHasil() {
    keHasilSetelahTutup.current = true
    setTerbuka(null)
  }

  const dariPencarian = terbuka === 'pencarian' && room.status !== 'menunggu_peserta'
  const aksiLain =
    dariPencarian && room.status === 'siap' ? (
      <Tombol varian="biasa" onClick={keHasil} className="min-h-11">
        Lihat hasil
      </Tombol>
    ) : dariPencarian && room.status === 'gagal' ? (
      <Tombol varian="biasa" onClick={keHasil} className="min-h-11">
        Kembali ke room
      </Tombol>
    ) : (
      <Tombol varian="biasa" onClick={tutup} className="min-h-11">
        Nanti saja
      </Tombol>
    )

  return (
    <>
      {tampilkanKartu && (
        <section
          aria-labelledby="traktir-ajak"
          className="flex min-w-0 items-center gap-4 rounded-stiker border-[2.5px] border-dashed border-garis/50 p-4"
        >
          <IlustrasiTraktir className="w-16" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 id="traktir-ajak" className="font-display text-lg leading-tight font-extrabold tracking-[-0.03em]">
                Terbantu Tikoem?
              </h2>
              <p className="text-sm text-teks-redup">Tikoem gratis dan tanpa iklan. Traktiran kecil membantunya tetap jalan.</p>
            </div>
            <Tombol
              varian="biasa"
              onClick={() => setTerbuka('tombol')}
              className="min-h-11"
            >
              Traktir Tikoem
            </Tombol>
          </div>
        </section>
      )}

      <DialogStiker terbuka={terbuka !== null} onTutup={tutup} idJudul="traktir-judul" idIsi="traktir-isi">
        <div className="relative flex flex-col items-center gap-4 p-5 pt-6 text-center">
          <button
            type="button"
            onClick={tutup}
            aria-label="Tutup"
            className="group absolute top-1.5 right-1.5 grid size-11 cursor-pointer place-items-center rounded-full focus-visible:outline-3 focus-visible:outline-pin-2"
          >
            <span className="grid size-9 place-items-center rounded-full border-[2.5px] border-garis bg-kartu shadow-stiker-kecil transition-[translate,box-shadow] duration-600 ease-pegas group-active:translate-[2px] group-active:shadow-none group-active:duration-90 motion-reduce:transition-none">
              <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden>
                <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
              </svg>
            </span>
          </button>

          <IlustrasiTraktir className="w-28 motion-safe:animate-muncul" />

          <div className="flex flex-col gap-2">
            <h2
              id="traktir-judul"
              tabIndex={-1}
              className="font-display text-2xl leading-tight font-extrabold tracking-[-0.03em] text-balance outline-none"
            >
              Traktir Tikoem kopi?
            </h2>
            <p id="traktir-isi" className="text-sm text-balance">
              Tikoem gratis, tanpa iklan, dan tanpa akun. Kalau Tikoem membantu kalian ketemuan, traktir sedikit lewat Sociabuzz
              supaya Tikoem tetap gratis dan terus dikembangkan.
            </p>
          </div>

          {dariPencarian && <StatusPencarian status={room.status} peserta={peserta} />}

          <div className="flex w-full flex-col items-center gap-2">
            <TautanTombol href={LINK_TRAKTIR} onClick={tutup} className="w-full">
              Traktir lewat Sociabuzz
            </TautanTombol>
            {aksiLain}
          </div>
          <p className="text-xs text-teks-redup">Sukarela, berapa pun. Sociabuzz dibuka di tab baru.</p>
        </div>
      </DialogStiker>
    </>
  )
}
