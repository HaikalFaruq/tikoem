import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { keadaanCariTempat, type GalatHitung } from '../../domain/hasil'
import { pilihanAkhir } from '../../domain/vote'
import { warnaPin } from '../../domain/warnaPin'
import { KartuStiker, Pin, Tombol } from '../../ui'
import type { IdentitasRoom } from '../room/identitas'
import { KartuHasil } from './KartuHasil'
import { KartuTempat } from './KartuTempat'
import type { Kandidat, Peserta, Room } from './tipe'

type Props = {
  room: Room
  peserta: Peserta[]
  kandidat: Kandidat[]
  identitas: IdentitasRoom
  onIdentitasHilang: () => void
}

/** Overpass dan OpenRouteService bisa makan puluhan detik, jadi setelah ini layar memberi tahu bahwa pencarian masih jalan. */
const LAMA_MENGHITUNG_MS = 10_000

const PESAN_GAGAL: Record<GalatHitung, string> = {
  TEMPAT_TIDAK_DITEMUKAN: 'Tidak ada kafe, resto, atau mal di sekitar titik tengah. Coba lagi setelah ada lokasi yang berubah.',
  LAYANAN_GAGAL: 'Layanan peta sedang gangguan, jadi tempatnya belum bisa dicari. Coba lagi sebentar lagi.',
}

const PESAN_GALAT_AKSI: Record<string, string> = {
  LOKASI_BELUM_CUKUP: 'Butuh minimal 2 orang yang berbagi lokasi.',
  SEDANG_MENGHITUNG: 'Tempatnya sedang dicari. Tunggu sebentar.',
  ROOM_BELUM_SIAP: 'Tempatnya sedang dicari ulang, jadi pilihanmu belum bisa disimpan. Coba lagi setelah hasilnya keluar.',
  KANDIDAT_TIDAK_ADA: 'Tempat ini sudah tidak ada di daftar. Pilih tempat lain.',
}

const kodeGalat = (e: unknown) => (e instanceof ConvexError ? (e.data as { galat?: string } | undefined)?.galat : undefined)

/** Tombol "Cari tempat", status pencarian, lalu kartu tempat dengan voting. */
export function BagianHasil({ room, peserta, kandidat, identitas, onIdentitasHilang }: Props) {
  const hitung = useMutation(api.room.hitung)
  const vote = useMutation(api.room.vote)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const [lama, setLama] = useState(false)

  const berbagi = peserta.filter((p) => p.lokasi).length
  const keadaan = keadaanCariTempat(room, berbagi, peserta.length)
  const menghitung = keadaan.jenis === 'menghitung'

  useEffect(() => {
    if (!menghitung) return
    const jam = window.setTimeout(() => setLama(true), LAMA_MENGHITUNG_MS)
    return () => {
      window.clearTimeout(jam)
      setLama(false)
    }
  }, [menghitung])

  async function jalankan(aksi: () => Promise<unknown>) {
    setGalat(null)
    setSibuk(true)
    try {
      await aksi()
    } catch (e) {
      const kode = kodeGalat(e)
      if (kode === 'PESERTA_TIDAK_DIKENAL') return onIdentitasHilang()
      setGalat((kode && PESAN_GALAT_AKSI[kode]) || 'Belum berhasil. Cek koneksi internetmu, lalu coba lagi.')
    } finally {
      setSibuk(false)
    }
  }

  const cari = () => jalankan(() => hitung(identitas))
  const pilih = (kandidatId: Id<'kandidat'> | null) => jalankan(() => vote({ ...identitas, kandidatId }))

  const pilihanSaya = kandidat.find((k) => k.pemilih.includes(identitas.pesertaId))?.id ?? null
  const skalaMenit = Math.max(1, ...kandidat.map((k) => k.terlamaMenit))
  const sudahPilih = kandidat.reduce((n, k) => n + k.pemilih.length, 0)
  const idTerpilih = pilihanAkhir(kandidat)
  const terpilih = kandidat.find((k) => k.id === idTerpilih) ?? null

  return (
    <section aria-labelledby="hasil-judul" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="hasil-judul" className="font-display text-2xl font-extrabold tracking-[-0.03em]">
          {keadaan.jenis === 'siap' ? 'Tempat paling adil' : 'Cari tempat'}
        </h2>
        {keadaan.jenis === 'siap' && (
          <p className="text-sm text-teks-redup">
            Diurutkan dari waktu tempuh terlama yang paling pendek. {sudahPilih} dari {peserta.length} orang sudah memilih.
          </p>
        )}
      </div>

      {(keadaan.jenis === 'kurang_lokasi' || keadaan.jenis === 'bisa_dicari') && (
        <KartuStiker className="flex flex-col gap-3 p-5">
          <p className="text-sm">
            <b className="tabular-nums">
              {keadaan.berbagi} dari {keadaan.total} orang
            </b>{' '}
            sudah berbagi lokasi.{' '}
            {keadaan.jenis === 'kurang_lokasi'
              ? 'Tempat bisa dicari setelah minimal 2 orang berbagi lokasi.'
              : keadaan.berbagi < keadaan.total
                ? 'Yang belum berbagi lokasi tidak ikut dihitung.'
                : 'Semua sudah siap.'}
          </p>
          <Tombol onClick={cari} disabled={keadaan.jenis === 'kurang_lokasi' || sibuk} className="w-full">
            {sibuk ? 'Memulai…' : 'Cari tempat'}
          </Tombol>
        </KartuStiker>
      )}

      {menghitung && (
        <KartuStiker className="flex flex-col items-center gap-3 p-5 text-center" aria-busy="true">
          <div className="flex items-end gap-2" aria-hidden>
            {peserta
              .filter((p) => p.lokasi)
              .slice(0, 5)
              .map((p, i) => (
                // Pin melompat bergantian, seperti sedang berjalan ke titik tengah.
                <span key={p.id} className="motion-safe:animate-bounce" style={{ animationDelay: `${i * 120}ms` }}>
                  <Pin {...warnaPin(p.urutanGabung)} ekspresi="nunggu" ukuran={28} />
                </span>
              ))}
          </div>
          <p aria-live="polite" className="font-semibold">
            {lama ? 'Masih mencari tempat di sekitar titik tengah…' : 'Mencari tempat paling adil…'}
          </p>
          <p className="text-sm text-teks-redup">Waktu tempuh tiap orang ke tiap tempat sedang dihitung.</p>
        </KartuStiker>
      )}

      {keadaan.jenis === 'gagal' && (
        <KartuStiker className="flex flex-col items-start gap-3 p-5">
          <Pin warna={5} ekspresi="kaget" ukuran={40} />
          <p className="font-semibold">{keadaan.galat ? PESAN_GAGAL[keadaan.galat] : 'Tempatnya belum berhasil dicari.'}</p>
          <Tombol onClick={cari} disabled={!keadaan.bisaDicobaLagi || sibuk}>
            Coba lagi
          </Tombol>
        </KartuStiker>
      )}

      {keadaan.jenis === 'siap' && keadaan.usang && (
        <KartuStiker className="flex flex-col gap-3 p-4">
          <p className="text-sm">
            <b>Ada lokasi yang berubah</b> setelah tempat ini dicari. Hitung ulang supaya semua orang ikut dihitung. Pilihan yang
            sudah masuk akan diulang.
          </p>
          <Tombol varian="biasa" onClick={cari} disabled={!keadaan.bisaHitungUlang || sibuk} className="self-start">
            Hitung ulang
          </Tombol>
        </KartuStiker>
      )}

      {galat && (
        <p role="alert" className="text-sm font-semibold">
          {galat}
        </p>
      )}

      {keadaan.jenis === 'siap' && terpilih && (
        <KartuHasil room={room} kandidat={terpilih} peserta={peserta} idSaya={identitas.pesertaId} />
      )}

      {kandidat.length > 0 && (keadaan.jenis === 'siap' || menghitung) && (
        <div className="flex flex-col gap-4">
          {kandidat.map((k) => (
            <KartuTempat
              key={k.id}
              kandidat={k}
              peserta={peserta}
              idSaya={identitas.pesertaId}
              skalaMenit={skalaMenit}
              pilihanSaya={k.id === pilihanSaya}
              redup={menghitung}
              sibuk={sibuk}
              onPilih={() => pilih(k.id)}
              onBatal={() => pilih(null)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
