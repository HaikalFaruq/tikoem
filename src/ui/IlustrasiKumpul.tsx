import { GambarBintang } from './Bintang'
import { GambarPin } from './Pin'

const PIN = [
  { x: 52, y: 118, warna: 1, jeda: '0ms' },
  { x: 120, y: 130, warna: 2, jeda: '120ms' },
  { x: 188, y: 118, warna: 3, jeda: '240ms' },
] as const

/** Tiga teman berkumpul di bawah bintang tempat kumpul. Pin jatuh berurutan saat layar dibuka. */
export function IlustrasiKumpul({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 140" aria-hidden className={`h-auto w-full max-w-full overflow-visible ${className ?? ''}`}>
      <g stroke="var(--color-garis)" strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 9" fill="none" opacity={0.55}>
        {PIN.map((p) => (
          <path key={p.warna} d={`M${p.x} ${p.y - 46} Q ${(p.x + 120) / 2} ${p.y - 60} 120 46`} />
        ))}
      </g>
      <g transform="translate(120 30) scale(1.3)">
        <GambarBintang />
      </g>
      {PIN.map((p) => (
        <g key={p.warna} transform={`translate(${p.x} ${p.y}) scale(1.15)`}>
          <g className="animate-jatuh origin-bottom [transform-box:fill-box] motion-reduce:animate-none" style={{ animationDelay: p.jeda }}>
            <GambarPin warna={p.warna} aksesori="polos" ekspresi="senang" />
          </g>
        </g>
      ))}
    </svg>
  )
}
