type Props = {
  ukuran?: number
  label?: string
  className?: string
}

/** Bintang tempat kumpul. Kuning hanya dipakai di sini, tidak pernah untuk pin orang. */
export function Bintang({ ukuran = 40, label, className }: Props) {
  return (
    <svg
      viewBox="-20 -20 40 40"
      width={ukuran}
      height={ukuran}
      className={`shrink-0 overflow-visible ${className ?? ''}`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path
        d="M0 -18 L3.4 -8.3 L12.7 -12.7 L8.3 -3.4 L18 0 L8.3 3.4 L12.7 12.7 L3.4 8.3 L0 18 L-3.4 8.3 L-12.7 12.7 L-8.3 3.4 L-18 0 L-8.3 -3.4 L-12.7 -12.7 L-3.4 -8.3 Z"
        fill="var(--color-bintang)"
        stroke="var(--color-garis)"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}
