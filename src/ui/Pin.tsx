// Bentuk sama dengan GayaPin di src/domain/warnaPin.ts, tapi ui tidak boleh import domain, jadi ditulis ulang di sini.
export type WarnaPin = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type AksesoriPin = 'polos' | 'kacamata' | 'pita'
export type Ekspresi = 'nunggu' | 'senang' | 'kaget' | 'sepakat'

type Props = {
  warna: WarnaPin
  aksesori?: AksesoriPin
  ekspresi?: Ekspresi
  /** Lebar dalam piksel. Tinggi mengikuti bentuk pin. */
  ukuran?: number
  /** Isi kalau pin berdiri sendiri. Tanpa label, pin dianggap hiasan dan disembunyikan dari pembaca layar. */
  label?: string
  className?: string
}

const TINTA = 'var(--color-tinta)'

function Wajah({ ekspresi }: { ekspresi: Ekspresi }) {
  return (
    <g transform="translate(0 -27)" stroke={TINTA} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {ekspresi === 'nunggu' && (
        <>
          <circle cx={-3} cy={-2} r={1.7} fill={TINTA} />
          <circle cx={7} cy={-2} r={1.7} fill={TINTA} />
          <path d="M-4 6 h7" />
        </>
      )}
      {ekspresi === 'senang' && (
        <>
          <circle cx={-5} cy={-2} r={1.7} fill={TINTA} />
          <circle cx={5} cy={-2} r={1.7} fill={TINTA} />
          <path d="M-5 4 Q0 10 5 4" />
        </>
      )}
      {ekspresi === 'kaget' && (
        <>
          <circle cx={-5} cy={-3} r={2.3} fill={TINTA} />
          <circle cx={5} cy={-3} r={2.3} fill={TINTA} />
          <ellipse cx={0} cy={6} rx={2.6} ry={3.2} />
        </>
      )}
      {ekspresi === 'sepakat' && (
        <>
          <path d="M-8 -1 q3 -4 6 0" />
          <path d="M2 -1 q3 -4 6 0" />
          <path d="M-6 3 Q0 11 6 3 Z" fill={TINTA} />
        </>
      )}
    </g>
  )
}

function Aksesori({ jenis }: { jenis: AksesoriPin }) {
  if (jenis === 'kacamata') {
    return (
      <g transform="translate(0 -27)" stroke={TINTA} strokeWidth={1.8} fill="rgb(255 255 255 / 0.35)">
        <circle cx={-5.5} cy={-2} r={4.4} />
        <circle cx={5.5} cy={-2} r={4.4} />
        <path d="M-1.1 -2.5 h2.2" fill="none" />
      </g>
    )
  }
  if (jenis === 'pita') {
    return (
      <g transform="translate(0 -44)" stroke="var(--color-garis)" strokeWidth={2} strokeLinejoin="round" fill="var(--color-bintang)">
        <path d="M0 0 L-9 -6 L-9 6 Z" />
        <path d="M0 0 L9 -6 L9 6 Z" />
        <circle r={2.6} />
      </g>
    )
  }
  return null
}

type GayaGambar = Required<Pick<Props, 'warna' | 'aksesori' | 'ekspresi'>>

/** Isi pin tanpa `<svg>`, untuk disusun di dalam ilustrasi. Ujung pin ada di titik (0, 0). */
export function GambarPin({ warna, aksesori, ekspresi }: GayaGambar) {
  return (
    <>
      <path
        d="M0 0 C -5 -9 -17 -15 -17 -27 A17 17 0 1 1 17 -27 C 17 -15 5 -9 0 0 Z"
        fill={`var(--color-pin-${warna})`}
        stroke="var(--color-garis)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Wajah ekspresi={ekspresi} />
      <Aksesori jenis={aksesori} />
    </>
  )
}

/** Pin berwajah: tanda tiap teman di peta, daftar, dan ilustrasi. */
export function Pin({ warna, aksesori = 'polos', ekspresi = 'senang', ukuran = 40, label, className }: Props) {
  return (
    <svg
      viewBox="-22 -54 44 58"
      width={ukuran}
      height={(ukuran * 58) / 44}
      className={`shrink-0 overflow-visible ${className ?? ''}`}
      data-warna={warna}
      data-aksesori={aksesori}
      data-ekspresi={ekspresi}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <GambarPin warna={warna} aksesori={aksesori} ekspresi={ekspresi} />
    </svg>
  )
}
