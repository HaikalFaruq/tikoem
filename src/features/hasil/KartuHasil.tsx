import { useEffect, useRef, useState } from 'react'
import { barisWaktuTempuh, labelKategori, linkRute, teksHasil, teksPenetap } from '../../domain/hasil'
import { linkRoom, linkWhatsApp } from '../../domain/undangan'
import { warnaPin } from '../../domain/warnaPin'
import { Bintang, DialogStiker, KartuStiker, Pin, TautanTombol, Tombol } from '../../ui'
import type { Kandidat, Peserta, Room } from './tipe'

type Props = {
  room: Room
  kandidat: Kandidat
  peserta: Peserta[]
  idSaya: string
  sibuk: boolean
  /** Dipanggil setelah dikonfirmasi, dengan tempat yang tampil saat dialognya dibuka. */
  onTetapkan: (kandidatId: Kandidat['id']) => void
}

const kunciMomen = (kode: string) => `tikoem:momen:${kode}`

/**
 * Momen gabung diputar sekali untuk setiap hasil baru, dan sekali lagi saat tempatnya ditetapkan, di HP ini, jadi tidak berulang setiap halaman dibuka (Discussions #8).
 * Yang sudah dilihat dibaca sekali saat layar dibuka. Hasil baru (hitung ulang) membuat momennya diputar lagi.
 */
function useMomenGabung(kode: string, hasilPada: number | null) {
  const [sudahDilihat] = useState(() => {
    try {
      return localStorage.getItem(kunciMomen(kode))
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (hasilPada === null) return
    try {
      localStorage.setItem(kunciMomen(kode), String(hasilPada))
    } catch {
      // Tanpa localStorage, momen diputar lagi saat halaman dibuka ulang. Tidak apa-apa.
    }
  }, [kode, hasilPada])
  return hasilPada !== null && String(hasilPada) !== sudahDilihat
}

/**
 * Kartu ringkas tempat dengan suara terbanyak, untuk ditetapkan lalu dikirim ke grup. Setelah ditetapkan (Discussions #42),
 * kartunya jadi versi final "Fix!" dengan nama orang yang menetapkan.
 */
export function KartuHasil({ room, kandidat, peserta, idSaya, sibuk, onTetapkan }: Props) {
  const baris = barisWaktuTempuh(kandidat.waktuTempuh, peserta)
  const saya = peserta.find((p) => p.id === idSaya) ?? null
  const tetap = room.tetap
  const momenPada = tetap?.pada ?? room.hasilPada
  const mainkan = useMomenGabung(room.kode, momenPada)
  // Tempat yang ditanyakan di dialog dikunci saat dialognya dibuka. Kalau suara berubah sementara itu, backend menolak
  // dengan PILIHAN_BERUBAH, bukan diam-diam menetapkan tempat lain.
  const [konfirmasi, setKonfirmasi] = useState<Pick<Kandidat, 'id' | 'nama'> | null>(null)
  const teks = teksHasil({
    namaTempat: kandidat.nama,
    kategori: kandidat.kategori,
    alamat: kandidat.alamat,
    lokasi: kandidat.lokasi,
    baris: baris.map((b) => ({ nama: b.peserta.nama, menit: b.menit })),
    terlamaMenit: kandidat.terlamaMenit,
    jumlahPemilih: kandidat.pemilih.length,
    jumlahPeserta: peserta.length,
    linkRoom: linkRoom(window.location.origin, room.kode),
    tetap: tetap !== null,
  })

  const [tersalin, setTersalin] = useState<'diam' | 'ya' | 'gagal'>('diam')
  const pengatur = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pengatur.current), [])
  async function salin() {
    window.clearTimeout(pengatur.current)
    try {
      await navigator.clipboard.writeText(teks)
      setTersalin('ya')
      pengatur.current = window.setTimeout(() => setTersalin('diam'), 2500)
    } catch {
      setTersalin('gagal')
    }
  }

  // Pin yang ikut dihitung, disebar di kiri dan kanan bintang lalu meluncur ke tengah.
  const pinMomen = baris.slice(0, 6)

  return (
    <KartuStiker
      as="article"
      aria-labelledby="kartu-hasil-judul"
      data-kartu-hasil
      data-momen={mainkan ? 'main' : undefined}
      data-tetap={tetap ? '' : undefined}
      className="flex min-w-0 flex-col gap-4 overflow-hidden p-5"
    >
      {/* key: hasil baru memasang ulang ilustrasinya, jadi animasinya diputar lagi. */}
      <div key={momenPada ?? 0} className="relative flex h-16 items-end justify-center" aria-hidden>
        <div className="flex items-end -space-x-2">
          {pinMomen.map((b, i) => (
            <span
              key={b.peserta.id}
              className={mainkan ? 'animate-kumpul motion-reduce:animate-none' : ''}
              style={{ ['--dari' as string]: `${(i - (pinMomen.length - 1) / 2) * 34}px`, animationDelay: `${i * 70}ms` }}
            >
              <Pin {...warnaPin(b.peserta.urutanGabung)} ekspresi="sepakat" ukuran={30} />
            </span>
          ))}
        </div>
        <span
          className={`absolute -top-1 left-1/2 -translate-x-1/2 ${mainkan ? 'animate-muncul motion-reduce:animate-none' : ''}`}
          style={{ animationDelay: '750ms' }}
        >
          <Bintang ukuran={36} />
        </span>
      </div>

      <header className="flex flex-col gap-1 text-center">
        {tetap ? (
          <p className="-rotate-2 self-center rounded-full border-2 border-garis bg-bintang px-3 py-0.5 text-sm font-extrabold text-tinta">
            Fix! Ketemuan di
          </p>
        ) : (
          <p className="text-sm font-semibold text-teks-redup">Ketemuan di</p>
        )}
        <h3 id="kartu-hasil-judul" className="font-display text-3xl leading-tight font-extrabold tracking-[-0.03em] text-balance">
          {kandidat.nama}
        </h3>
        <p className="text-sm text-teks-redup">{[labelKategori(kandidat.kategori), kandidat.alamat].filter(Boolean).join(' · ')}</p>
      </header>

      <ul className="flex flex-wrap justify-center gap-2" aria-label="Waktu tempuh ke tempat ini">
        {baris.map(({ peserta: p, menit }) => (
          <li key={p.id} className="flex items-center gap-1.5 rounded-full border-2 border-garis bg-kertas py-0.5 pr-2.5 pl-1 text-sm">
            <Pin {...warnaPin(p.urutanGabung)} ukuran={16} />
            <span className="max-w-24 truncate">{p.id === idSaya ? 'Kamu' : p.nama}</span>
            <b className="tabular-nums">{menit} mnt</b>
          </li>
        ))}
      </ul>

      <p className="text-center text-sm">
        Terlama <b className="tabular-nums">{kandidat.terlamaMenit} mnt</b> ·{' '}
        {tetap
          ? teksPenetap(tetap.olehPesertaId, peserta, idSaya)
          : kandidat.pemilih.length > 0
            ? `Dipilih ${kandidat.pemilih.length} dari ${peserta.length} orang`
            : 'Belum ada yang memilih, jadi ini yang paling adil'}
      </p>

      <div className="flex flex-col gap-2">
        {/* Sebelum ditetapkan, aksi utamanya menetapkan. Setelahnya, mengirim versi final ke grup. */}
        {!tetap && (
          <Tombol onClick={() => setKonfirmasi({ id: kandidat.id, nama: kandidat.nama })} disabled={sibuk} className="w-full">
            Tetapkan tempat ini
          </Tombol>
        )}
        <TautanTombol href={linkWhatsApp(teks)} varian={tetap ? 'utama' : 'biasa'} className={tetap ? 'w-full' : 'self-center'}>
          Kirim hasil ke grup WA
        </TautanTombol>
        {saya && (
          <TautanTombol varian="biasa" href={linkRute(kandidat.lokasi, saya.kendaraan)} className="self-center">
            Lihat rute ke sana
          </TautanTombol>
        )}
        <Tombol varian="biasa" onClick={salin} className="self-center">
          {tersalin === 'ya' ? 'Tersalin' : 'Salin teks hasil'}
        </Tombol>
        <p aria-live="polite" className={tersalin === 'gagal' ? 'text-center text-sm font-semibold' : 'sr-only'}>
          {tersalin === 'ya' && 'Teks hasil tersalin. Tempel di grup.'}
          {tersalin === 'gagal' && 'Browser menolak menyalin. Pakai tombol Kirim hasil ke grup WA.'}
        </p>
      </div>

      <DialogStiker terbuka={konfirmasi !== null} onTutup={() => setKonfirmasi(null)} idJudul="tetapkan-judul" idIsi="tetapkan-isi">
        <div className="flex flex-col items-center gap-4 p-5 pt-6 text-center">
          <Bintang ukuran={44} />
          <div className="flex flex-col gap-2">
            <h2
              id="tetapkan-judul"
              tabIndex={-1}
              className="font-display text-2xl leading-tight font-extrabold tracking-[-0.03em] text-balance outline-none"
            >
              Tetapkan {konfirmasi?.nama} untuk semua orang?
            </h2>
            <p id="tetapkan-isi" className="text-sm text-balance">
              Voting ditutup di HP semua orang. Kalau rencananya berubah, siapa saja bisa membukanya lagi.
            </p>
          </div>
          <div className="flex w-full flex-col items-center gap-2">
            <Tombol
              onClick={() => {
                if (konfirmasi) onTetapkan(konfirmasi.id)
                setKonfirmasi(null)
              }}
              className="w-full"
            >
              Tetapkan
            </Tombol>
            <Tombol varian="biasa" onClick={() => setKonfirmasi(null)} className="min-h-11">
              Batal
            </Tombol>
          </div>
        </div>
      </DialogStiker>
    </KartuStiker>
  )
}
