import { useState, type ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { dihitungAkhirPekan } from '../../domain/transportasiUmum'
import { lamaPerjalanan, namaJalur, perkiraanBerangkat, teksLewat } from '../../domain/perjalanan'
import { jamJakarta } from '../../lib/waktu'
import { Tombol } from '../../ui'
import type { IdentitasRoom } from '../room/identitas'
import type { Peserta } from './tipe'

type Rute = NonNullable<Peserta['rute']>
type RuteSiap = Extract<Rute, { status: 'siap' }>
type Langkah = RuteSiap['langkah'][number]

type Props = {
  saya: Peserta
  /** Waktu tempuhku ke tempat yang ditetapkan, atau `null` kalau aku belum ikut dihitung. */
  menit: number | null
  jamKetemuan: number | null
  identitas: IdentitasRoom
  onIdentitasHilang: () => void
}

const AJAKAN_JAM = 'Atur jam ketemuan di atas supaya tahu kapan harus berangkat.'

/**
 * Bagian "Perjalananmu" di kartu Fix! (Discussions #83): kapan berangkat, dan untuk yang naik transportasi umum, naik apa,
 * dari mana, dan turun di mana. Hanya punya sendiri, sesuai #74. Jam hanya ditulis kalau ada jam ketemuan, karena tanpa itu
 * ringkasannya dihitung untuk berangkat saat itu juga dan cepat basi.
 */
export function PerjalananSaya({ saya, menit, jamKetemuan, identitas, onIdentitasHilang }: Props) {
  if (saya.kendaraan === 'transportasi_umum') {
    if (!saya.rute) return null
    return (
      <Bagian>
        <RuteTransportasiUmum rute={saya.rute} identitas={identitas} onIdentitasHilang={onIdentitasHilang} />
      </Bagian>
    )
  }
  if (menit === null) return null
  if (jamKetemuan === null) {
    return (
      <Bagian>
        <p className="text-sm text-teks-redup">{AJAKAN_JAM}</p>
      </Bagian>
    )
  }
  const { berangkat, cadanganMenit } = perkiraanBerangkat(jamKetemuan, menit, saya.kendaraan)
  return (
    <Bagian>
      <p className="text-sm">
        Berangkat sekitar <b className="tabular-nums">{jamJakarta(berangkat)}</b>
        {cadanganMenit > 0 ? `, sudah termasuk ${cadanganMenit} menit untuk macet.` : '.'}
      </p>
    </Bagian>
  )
}

function Bagian({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="perjalanan-judul" className="flex flex-col gap-2 text-left" data-perjalanan-saya>
      <h4 id="perjalanan-judul" className="text-sm font-extrabold">
        Perjalananmu
      </h4>
      {children}
    </section>
  )
}

function RuteTransportasiUmum({ rute, identitas, onIdentitasHilang }: { rute: Rute } & Pick<Props, 'identitas' | 'onIdentitasHilang'>) {
  const hitungRute = useMutation(api.room.hitungRute)
  const [mencoba, setMencoba] = useState(false)
  const [galat, setGalat] = useState(false)

  async function cobaLagi() {
    setGalat(false)
    setMencoba(true)
    try {
      await hitungRute(identitas)
    } catch (e) {
      const kode = e instanceof ConvexError ? (e.data as { galat?: string } | undefined)?.galat : undefined
      if (kode === 'PESERTA_TIDAK_DIKENAL') return onIdentitasHilang()
      setGalat(true)
    } finally {
      setMencoba(false)
    }
  }

  switch (rute.status) {
    case 'menghitung':
      return (
        <p className="text-sm text-teks-redup" aria-busy="true">
          Mencari rute KRL dan TransJakarta untukmu…
        </p>
      )
    case 'gagal':
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm">Rute transportasi umummu belum bisa dicari karena layanan rutenya sedang gangguan.</p>
          <Tombol varian="biasa" onClick={cobaLagi} disabled={mencoba} className="min-h-11">
            {mencoba ? 'Mencoba…' : 'Coba lagi'}
          </Tombol>
          {galat && (
            <p role="alert" className="text-sm font-semibold">
              Belum berhasil. Cek koneksi internetmu, lalu coba lagi.
            </p>
          )}
        </div>
      )
    case 'tidak_ada':
      return (
        <p className="text-sm">
          {rute.jamKetemuan === null
            ? 'Belum ada rute KRL atau TransJakarta dari lokasimu kalau berangkat sekarang. Atur jam ketemuan di atas untuk melihat rute di jam lain.'
            : 'Belum ada rute KRL atau TransJakarta di jam itu. Coba ubah jam ketemuan di atas.'}
        </p>
      )
    case 'siap':
      return <RuteSiapTampil rute={rute} />
  }
}

function RuteSiapTampil({ rute }: { rute: RuteSiap }) {
  const berjam = rute.jamKetemuan !== null
  return (
    <>
      {berjam ? (
        <p className="text-sm">
          Berangkat paling lambat <b className="tabular-nums">{jamJakarta(rute.berangkat)}</b>, sampai{' '}
          <span className="tabular-nums">{jamJakarta(rute.sampai)}</span>.
        </p>
      ) : (
        <p className="text-sm">
          Sekitar <b className="tabular-nums">{lamaPerjalanan(rute)} menit</b> perjalanan. {AJAKAN_JAM}
        </p>
      )}
      <ol className="flex flex-col gap-2" aria-label="Langkah perjalanan">
        {rute.langkah.map((l, i) => (
          <LangkahTampil key={i} langkah={l} berjam={berjam} />
        ))}
      </ol>
      {/* Sumber Transitous-nya sudah disebut di catatan di atas daftar tempat. Di sini cukup batasnya (Discussions #83). */}
      <p className="text-sm text-teks-redup">Rute ini belum memakai MRT dan LRT.</p>
      {/* Catatan yang sama ada di atas daftar tempat, tapi orang yang membaca rutenya belum tentu menggulir ke sana. */}
      {dihitungAkhirPekan(rute.jamKetemuan ?? rute.dihitungPada) && (
        <p className="text-sm text-teks-redup" data-catatan-akhir-pekan>
          Jadwal KRL akhir pekan belum tersedia, jadi rute ini memakai jadwal hari kerja di jam yang sama. Jamnya bisa berbeda.
        </p>
      )}
    </>
  )
}

function LangkahTampil({ langkah: l, berjam }: { langkah: Langkah; berjam: boolean }) {
  if (l.jenis === 'jalan') {
    return (
      <li className="flex items-center gap-2 text-sm text-teks-redup" data-langkah="jalan">
        <span aria-hidden className="mr-1 ml-3 h-5 w-0 shrink-0 border-l-2 border-dashed border-garis/40" />
        Jalan {l.menit} menit ke {l.ke ?? 'tempat'}
      </li>
    )
  }
  const lewat = teksLewat(l.jenis, l.perhentian)
  return (
    <li className="flex flex-col gap-1 rounded-2xl border-2 border-garis bg-kertas px-3 py-2 text-sm" data-langkah={l.jenis}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`rounded-full border-2 border-garis px-2 py-0.5 text-xs font-extrabold ${l.warna ? '' : 'bg-kartu text-teks'}`}
          style={l.warna ? { backgroundColor: l.warna.latar, color: l.warna.teks } : undefined}
          data-chip-jalur
        >
          {namaJalur(l)}
        </span>
        <span>arah {l.arah}</span>
      </p>
      <p>
        Naik di <b>{l.naik}</b>
        {berjam && <span className="tabular-nums"> ({jamJakarta(l.mulai)})</span>}, turun di <b>{l.turun}</b>
      </p>
      <p className="text-teks-redup">{[lewat, `${l.menit} menit`].filter(Boolean).join(' · ')}</p>
    </li>
  )
}
