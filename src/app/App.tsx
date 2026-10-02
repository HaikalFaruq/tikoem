import { useState } from 'react'
import { warnaPin } from '../domain/warnaPin'
import { Avatar, Bintang, KartuStiker, PilihanChip, Pin, Tombol } from '../ui'

// Layar sementara sampai layar buat room dibangun: menampilkan identitas dan komponen dasar di atas token yang sebenarnya.

const KENDARAAN = [
  { nilai: 'motor', label: 'Motor' },
  { nilai: 'mobil', label: 'Mobil' },
  { nilai: 'jalan_kaki', label: 'Jalan kaki' },
] as const

type Kendaraan = (typeof KENDARAAN)[number]['nilai']

const CONTOH_URUTAN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 17]
const CONTOH_PESERTA = [
  { nama: 'Haikal', menit: 24 },
  { nama: 'Bintang', menit: 27 },
  { nama: 'Umar', menit: 22 },
]

export default function App() {
  const [kendaraan, setKendaraan] = useState<Kendaraan>('motor')

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Pin warna={1} ukuran={48} />
          <h1 className="font-display text-5xl font-extrabold tracking-[-0.05em] [font-variation-settings:'opsz'_96] [text-shadow:3px_3px_0_var(--color-merah)]">
            Tikoem
          </h1>
        </div>
        <p className="text-lg">Titik kumpul yang adil buat semua.</p>
      </header>

      <KartuStiker as="section" aria-labelledby="pratinjau-judul" className="flex min-w-0 flex-col gap-6 p-5">
        <div className="flex flex-col gap-1">
          <h2 id="pratinjau-judul" className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Pratinjau komponen
          </h2>
          <p className="text-sm text-teks-redup">Layar buat room menyusul di atas komponen-komponen ini.</p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Pin teman menurut urutan gabung</h3>
          <ul className="flex flex-wrap items-end gap-x-2 gap-y-3">
            {CONTOH_URUTAN.map((urutan) => (
              <li key={urutan}>
                <Pin {...warnaPin(urutan)} ukuran={32} label={`Orang ke-${urutan}`} />
              </li>
            ))}
          </ul>
        </div>

        <PilihanChip judul="Kendaraan" pilihan={KENDARAAN} nilai={kendaraan} onUbah={setKendaraan} />

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Bintang ukuran={28} />
            <h3 className="font-display text-xl font-extrabold tracking-[-0.03em]">Kafe Taman Tebet</h3>
          </div>
          <ul className="flex flex-col gap-2">
            {CONTOH_PESERTA.map((p, i) => (
              <li key={p.nama} className="flex items-center gap-3 text-sm">
                <Avatar nama={p.nama} warna={warnaPin(i + 1).warna} />
                <span className="min-w-0 flex-1 truncate">{p.nama}</span>
                <span className="font-bold tabular-nums">{p.menit} mnt</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tombol>Pilih tempat ini</Tombol>
          <Tombol varian="biasa">Lihat tempat lain</Tombol>
        </div>
      </KartuStiker>
    </main>
  )
}
