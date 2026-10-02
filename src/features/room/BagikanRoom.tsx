import { useEffect, useRef, useState } from 'react'
import { linkRoom, linkWhatsApp, teksUndangan } from '../../domain/undangan'
import { KartuStiker, TautanTombol, Tombol } from '../../ui'

type Props = { kode: string; sendirian: boolean }

/** Undangan ke grup: kirim lewat WhatsApp, atau salin link-nya untuk aplikasi lain. */
export function BagikanRoom({ kode, sendirian }: Props) {
  const link = linkRoom(window.location.origin, kode)
  const [status, setStatus] = useState<'diam' | 'tersalin' | 'gagal'>('diam')
  const isianLink = useRef<HTMLInputElement>(null)
  const pengatur = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(pengatur.current), [])

  async function salin() {
    window.clearTimeout(pengatur.current)
    try {
      await navigator.clipboard.writeText(link)
      setStatus('tersalin')
      pengatur.current = window.setTimeout(() => setStatus('diam'), 2500)
    } catch {
      // Sebagian browser menolak clipboard. Link-nya dipilih supaya bisa disalin manual.
      setStatus('gagal')
      isianLink.current?.select()
    }
  }

  return (
    <KartuStiker as="section" aria-labelledby="bagikan-judul" className="flex min-w-0 flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="bagikan-judul" className="font-display text-2xl font-extrabold tracking-[-0.03em]">
          {sendirian ? 'Ajak teman-temanmu' : 'Undang teman lagi'}
        </h2>
        <p className="text-sm text-teks-redup">Siapa pun yang punya link ini bisa gabung ke room, cukup dengan nama.</p>
      </div>
      <TautanTombol href={linkWhatsApp(teksUndangan(link))} className="w-full">
        Kirim ke grup WA
      </TautanTombol>
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor="link-room" className="sr-only">
          Link room
        </label>
        <input
          ref={isianLink}
          id="link-room"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate rounded-full border-2 border-garis/40 bg-kertas px-3 py-1.5 text-sm text-teks-redup"
        />
        <Tombol varian="biasa" onClick={salin}>
          {status === 'tersalin' ? 'Tersalin' : 'Salin link'}
        </Tombol>
      </div>
      <p aria-live="polite" className={status === 'gagal' ? 'text-sm font-semibold' : 'sr-only'}>
        {status === 'tersalin' && 'Link tersalin. Tempel di grup.'}
        {status === 'gagal' && 'Link sudah dipilih. Salin manual dari kolom di atas.'}
      </p>
    </KartuStiker>
  )
}
