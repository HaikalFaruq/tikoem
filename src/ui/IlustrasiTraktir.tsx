/** Kopi di cangkir, isinya tetap cokelat di kedua tema. */
const KOPI = '#6B3F22'
const BUSA = '#FFE7CC'

const GAGANG = 'M100 54 C122 52 124 82 97 82'

/**
 * Cangkir kopi berwajah untuk ajakan traktir, dengan wajah senang yang sama seperti pin. Cangkirnya merah seperti
 * tombol utama, bukan kuning, karena kuning bintang hanya untuk tempat kumpul.
 */
export function IlustrasiTraktir({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 112" aria-hidden className={`h-auto shrink-0 overflow-visible ${className ?? ''}`}>
      <g stroke="var(--color-garis)" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.55}>
        <path d="M56 30 q-6 -7 0 -13 q6 -6 0 -13" />
        <path d="M70 25 q-6 -7 0 -13 q6 -6 0 -13" />
        <path d="M84 30 q-6 -7 0 -13 q6 -6 0 -13" />
      </g>
      <ellipse cx={70} cy={100} rx={50} ry={9} fill="var(--color-kartu)" stroke="var(--color-garis)" strokeWidth={3} />
      {/* Gagang: garis tebal dulu, lalu merah di atasnya, supaya ikut bertepi tinta. Ujungnya tertutup badan cangkir. */}
      <path d={GAGANG} fill="none" stroke="var(--color-garis)" strokeWidth={11} strokeLinecap="round" />
      <path d={GAGANG} fill="none" stroke="var(--color-merah)" strokeWidth={5} strokeLinecap="round" />
      <path
        d="M34 42 H106 L99 86 Q97 97 86 97 H54 Q43 97 41 86 Z"
        fill="var(--color-merah)"
        stroke="var(--color-garis)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <ellipse cx={70} cy={42} rx={36} ry={8} fill={KOPI} stroke="var(--color-garis)" strokeWidth={3} />
      <path d="M70 47 C63 44 60 40 64 38.5 C66.5 37.6 69 38.8 70 41 C71 38.8 73.5 37.6 76 38.5 C80 40 77 44 70 47 Z" fill={BUSA} />
      <g stroke="var(--color-tinta)" strokeWidth={2.6} strokeLinecap="round" fill="none">
        <circle cx={61} cy={63} r={2.4} fill="var(--color-tinta)" />
        <circle cx={79} cy={63} r={2.4} fill="var(--color-tinta)" />
        <path d="M62 71 Q70 79 78 71" />
      </g>
      <ellipse cx={52} cy={71} rx={4.5} ry={2.6} fill="var(--color-pin-5)" opacity={0.9} />
      <ellipse cx={88} cy={71} rx={4.5} ry={2.6} fill="var(--color-pin-5)" opacity={0.9} />
    </svg>
  )
}
