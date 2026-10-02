import { barisWaktuTempuh, labelKategori, linkMaps } from '../../domain/hasil'
import { warnaPin } from '../../domain/warnaPin'
import { formatJarak } from '../../lib/teks'
import { KartuStiker, Pin, TautanTombol, Tombol } from '../../ui'
import type { Kandidat, Peserta } from './tipe'

type Props = {
  kandidat: Kandidat
  peserta: Peserta[]
  idSaya: string
  /** Menit terlama di antara semua kandidat, supaya panjang batang bisa dibandingkan antarkartu. */
  skalaMenit: number
  pilihanSaya: boolean
  /** Saat menghitung ulang: kartu lama tetap tampil, redup, dan belum bisa dipilih. */
  redup: boolean
  sibuk: boolean
  onPilih: () => void
  onBatal: () => void
}

/** Satu kandidat tempat: waktu tempuh tiap orang, lalu siapa saja yang memilihnya. */
export function KartuTempat({ kandidat, peserta, idSaya, skalaMenit, pilihanSaya, redup, sibuk, onPilih, onBatal }: Props) {
  const baris = barisWaktuTempuh(kandidat.waktuTempuh, peserta)
  const pemilih = kandidat.pemilih.flatMap((id) => peserta.filter((p) => p.id === id))

  return (
    <KartuStiker
      as="article"
      aria-labelledby={`tempat-${kandidat.id}`}
      data-kandidat={kandidat.peringkat}
      className={`flex min-w-0 flex-col gap-4 p-4 transition-opacity ${redup ? 'opacity-50' : ''} ${pilihanSaya ? 'outline-4 outline-offset-2 outline-bintang' : ''}`}
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border-2 border-garis px-2.5 py-0.5 text-xs font-extrabold ${
              kandidat.peringkat === 1 ? '-rotate-3 bg-bintang text-tinta' : 'bg-kertas text-teks'
            }`}
          >
            {kandidat.peringkat === 1 ? '#1 paling adil' : `#${kandidat.peringkat}`}
          </span>
          {pilihanSaya && <span className="text-xs font-extrabold">Pilihanmu</span>}
        </div>
        <h3 id={`tempat-${kandidat.id}`} className="font-display text-xl leading-tight font-extrabold tracking-[-0.03em]">
          {kandidat.nama}
        </h3>
        <p className="text-sm text-teks-redup">
          {labelKategori(kandidat.kategori)} · {kandidat.alamat ?? `${formatJarak(kandidat.jarakDariTengahMeter)} dari titik tengah`}
        </p>
      </header>

      <ul className="flex flex-col gap-2" aria-label="Waktu tempuh tiap orang">
        {baris.map(({ peserta: p, menit }) => (
          <li key={p.id} className="grid grid-cols-[1.5rem_minmax(0,5.5em)_minmax(0,1fr)_3.8rem] items-center gap-2 text-sm">
            <Pin {...warnaPin(p.urutanGabung)} ukuran={20} />
            <span className="truncate">{p.id === idSaya ? 'Kamu' : p.nama}</span>
            <span className="h-2.5 overflow-hidden rounded-full border-2 border-garis bg-kertas" aria-hidden>
              <span
                className="block h-full border-r-2 border-garis"
                style={{
                  width: `${Math.max(6, (menit / skalaMenit) * 100)}%`,
                  backgroundColor: `var(--color-pin-${warnaPin(p.urutanGabung).warna})`,
                }}
              />
            </span>
            <span className={`text-right tabular-nums ${menit === kandidat.terlamaMenit ? 'font-extrabold' : 'font-semibold'}`}>
              {menit} mnt
            </span>
          </li>
        ))}
      </ul>

      <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t-[2.5px] border-dashed border-garis pt-3 text-sm">
        <span>
          Terlama <b className="tabular-nums">{kandidat.terlamaMenit} mnt</b>
        </span>
        <span className="tabular-nums">Selisih {kandidat.selisihMenit} mnt</span>
      </p>

      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
        {pemilih.length > 0 ? (
          <>
            <ul className="flex items-end" aria-label={`Dipilih ${pemilih.map((p) => (p.id === idSaya ? 'kamu' : p.nama)).join(', ')}`}>
              {pemilih.map((p, i) => (
                <li key={p.id} className={i === 0 ? '' : '-ml-2.5'} style={{ zIndex: pemilih.length - i }}>
                  <Pin {...warnaPin(p.urutanGabung)} ukuran={24} className="animate-jatuh origin-bottom motion-reduce:animate-none" />
                </li>
              ))}
            </ul>
            <span className="text-sm font-bold tabular-nums">{pemilih.length} suara</span>
          </>
        ) : (
          <span className="text-sm text-teks-redup">Belum ada yang memilih.</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {pilihanSaya ? (
          <Tombol varian="biasa" onClick={onBatal} disabled={redup || sibuk}>
            Batalkan pilihan
          </Tombol>
        ) : (
          <Tombol onClick={onPilih} disabled={redup || sibuk} className="min-w-44 flex-1 whitespace-nowrap">
            Pilih tempat ini
          </Tombol>
        )}
        <TautanTombol varian="biasa" href={linkMaps(kandidat.lokasi)} className="self-center">
          Buka di Maps
        </TautanTombol>
      </div>
    </KartuStiker>
  )
}
